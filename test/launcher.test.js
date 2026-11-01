const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

test("controls menu waits for a new selection after Docker is unavailable", {
  skip: process.platform !== "win32"
}, () => {
  const script = `
$global:dockerCalls = 0
$global:selectionCalls = 0
function global:docker { $global:dockerCalls++; $global:LASTEXITCODE = 1 }
function global:Read-Host {
  $prompt = [string]$args[0]
  if ($prompt -eq "Choose an option") {
    $global:selectionCalls = $global:selectionCalls + 1
    if ($global:selectionCalls -eq 1) { return "1" }
    if ($global:selectionCalls -eq 2) { return "" }
    return "Q"
  }
  return ""
}
function global:Clear-Host {}
function global:Write-Host {}
& $env:GAMEHUB_LAUNCHER_TEST_PATH -Action Menu
[pscustomobject]@{ dockerCalls = $global:dockerCalls; selectionCalls = $global:selectionCalls } | ConvertTo-Json -Compress
`;
  const result = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")], {
    encoding: "utf8", timeout: 10_000,
    env: { ...process.env, GAMEHUB_LAUNCHER_TEST_PATH: path.resolve(__dirname, "../GameHub.ps1") }
  });
  assert.equal(result.status, 0, result.stderr);
  const outcome = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
  assert.equal(outcome.dockerCalls, 1, "an unavailable Docker engine must not continue into startup");
  assert.equal(outcome.selectionCalls, 3, "the menu should safely ignore an empty selection before accepting another option");
});

test("direct local launch returns to the menu after Docker is unavailable", {
  skip: process.platform !== "win32"
}, () => {
  const script = `
$global:dockerCalls = 0
$global:readCalls = 0
function global:docker { $global:dockerCalls++; $global:LASTEXITCODE = 1 }
function global:Read-Host {
  $global:readCalls = $global:readCalls + 1
  switch ($global:readCalls) {
    1 { return "" }
    2 { return "1" }
    3 { return "" }
    4 { return "Q" }
  }
}
function global:Clear-Host {}
& $env:GAMEHUB_LAUNCHER_TEST_PATH -Action Local
[pscustomobject]@{ dockerCalls = $global:dockerCalls; readCalls = $global:readCalls } | ConvertTo-Json -Compress
`;
  const result = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")], {
    encoding: "utf8", timeout: 10_000,
    env: { ...process.env, GAMEHUB_LAUNCHER_TEST_PATH: path.resolve(__dirname, "../GameHub.ps1") }
  });
  assert.equal(result.status, 0, result.stderr);
  const outcome = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
  assert.equal(outcome.dockerCalls, 2, `the menu should allow a second launch attempt:\n${result.stdout}`);
  assert.equal(outcome.readCalls, 4);
});

for (const stopFails of [false, true]) {
  test(`Local launcher ${stopFails ? "aborts when the public tunnel cannot stop" : "stops the public tunnel before starting only GameHub"}`, {
    skip: process.platform !== "win32"
  }, () => {
    // Load only the function under test; never run the launcher's menu or Docker.
    const script = `
$tokens = $null
$parseErrors = $null
$tree = [System.Management.Automation.Language.Parser]::ParseFile($env:GAMEHUB_LAUNCHER_TEST_PATH, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count -gt 0) { throw "Launcher did not parse" }
$definition = $tree.Find({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Start-LocalGameHub' }, $true)
Invoke-Expression $definition.Extent.Text
$script:commands = [System.Collections.Generic.List[string]]::new()
function Test-Docker { return $true }
function Wait-ForGameHub { return $true }
function Set-GameHubPublicUrl { return $true }
function Wait-ForUser {}
function Start-Process {}
function Write-Host {}
function docker {
  $command = $args -join ' '
  $script:commands.Add($command)
  $global:LASTEXITCODE = 0
  if ($env:GAMEHUB_LAUNCHER_TEST_STOP_FAILS -eq 'true' -and $command -eq 'compose --profile public stop tunnel') { $global:LASTEXITCODE = 1 }
}
Start-LocalGameHub
ConvertTo-Json -InputObject @($script:commands) -Compress
`;
    const result = spawnSync("powershell.exe", ["-NoProfile", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")], {
      encoding: "utf8", timeout: 10_000,
      env: { ...process.env, GAMEHUB_LAUNCHER_TEST_PATH: path.resolve(__dirname, "../GameHub.ps1"),
        GAMEHUB_LAUNCHER_TEST_STOP_FAILS: String(stopFails) }
    });
    assert.equal(result.status, 0, result.stderr);
    const commands = JSON.parse(result.stdout.trim());
    assert.deepEqual(commands, stopFails
      ? ["compose --profile public stop tunnel"]
      : ["compose --profile public stop tunnel", "compose up --build --detach gamehub"]);
  });
}


for (const exitCode of [0, 1]) {
  test(`Stop launcher reports Docker ${exitCode === 0 ? "success" : "failure"} accurately`, {
    skip: process.platform !== "win32"
  }, () => {
    const script = `
$tokens = $null
$parseErrors = $null
$tree = [System.Management.Automation.Language.Parser]::ParseFile($env:GAMEHUB_LAUNCHER_TEST_PATH, [ref]$tokens, [ref]$parseErrors)
$definition = $tree.Find({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Stop-GameHub' }, $true)
Invoke-Expression $definition.Extent.Text
function Test-Docker { return $true }
function Wait-ForUser {}
function Write-Host { $args -join ' ' }
function docker { $global:LASTEXITCODE = ${exitCode} }
Stop-GameHub
`;
    const result = spawnSync("powershell.exe", ["-NoProfile", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")], {
      encoding: "utf8", timeout: 10_000,
      env: { ...process.env, GAMEHUB_LAUNCHER_TEST_PATH: path.resolve(__dirname, "../GameHub.ps1") }
    });
    assert.equal(result.status, 0, result.stderr);
    if (exitCode === 0) assert.match(result.stdout, /GameHub has stopped/);
    else {
      assert.doesNotMatch(result.stdout, /GameHub has stopped/);
      assert.match(result.stdout, /GameHub could not be stopped/);
    }
  });
}


for (const previousTrust of [null, "false", "true"]) {
  for (const launchOutcome of ["success", "start-failure", "missing-container", "inspect-failure"]) {
    const startFails = launchOutcome === "start-failure";
    const metadataFails = launchOutcome === "missing-container" || launchOutcome === "inspect-failure";
    test(`Public launcher ignores old tunnel logs and restores ${previousTrust ?? "unset"} trust setting after ${launchOutcome}`, {
      skip: process.platform !== "win32"
    }, () => {
      const script = `
$tokens = $null
$parseErrors = $null
$tree = [System.Management.Automation.Language.Parser]::ParseFile($env:GAMEHUB_LAUNCHER_TEST_PATH, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count -gt 0) { throw "Launcher did not parse" }
$definition = $tree.Find({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Start-PublicGameHub' }, $true)
Invoke-Expression $definition.Extent.Text
$script:urls = [System.Collections.Generic.List[string]]::new()
$script:trustDuringStart = $null
$script:logCommands = [System.Collections.Generic.List[string]]::new()
function Test-Docker { return $true }
function Wait-ForGameHub { return $true }
function Set-GameHubPublicUrl { param([string]$Value = "") $script:urls.Add($Value); return $true }
function Set-GameHubClipboard { return $true }
function Wait-ForUser {}
function Start-Process {}
function Start-Sleep {}
function Write-Host {}
function docker {
  $command = $args -join ' '
  $global:LASTEXITCODE = 0
  if ($command -eq 'compose --profile public up --build --detach') {
    $script:trustDuringStart = $env:GAMEHUB_TRUST_CLOUDFLARE_IP
    if ($env:GAMEHUB_LAUNCHER_TEST_START_FAILS -eq 'true') { $global:LASTEXITCODE = 1 }
  } elseif ($command -eq 'compose --profile public ps --quiet tunnel') {
    if ($env:GAMEHUB_LAUNCHER_TEST_OUTCOME -ne 'missing-container') { 'review-tunnel' }
  } elseif ($args[0] -eq 'inspect') {
    if ($env:GAMEHUB_LAUNCHER_TEST_OUTCOME -eq 'inspect-failure') { $global:LASTEXITCODE = 1 }
    else { '2026-10-26T12:00:00.000000000Z' }
  } elseif ($command -match '^compose logs') {
    $script:logCommands.Add($command)
    if ($args -contains '--since') { 'https://fresh-tunnel.trycloudflare.com' }
    else { 'https://expired-tunnel.trycloudflare.com' }
  }
}
if ($env:GAMEHUB_LAUNCHER_TEST_PREVIOUS_TRUST -eq 'unset') {
  Remove-Item Env:\GAMEHUB_TRUST_CLOUDFLARE_IP -ErrorAction SilentlyContinue
} else { $env:GAMEHUB_TRUST_CLOUDFLARE_IP = $env:GAMEHUB_LAUNCHER_TEST_PREVIOUS_TRUST }
Start-PublicGameHub
[pscustomobject]@{ urls = @($script:urls); trustDuringStart = $script:trustDuringStart; trustAfter = $env:GAMEHUB_TRUST_CLOUDFLARE_IP; logCommands = @($script:logCommands) } | ConvertTo-Json -Compress
`;
      const result = spawnSync("powershell.exe", ["-NoProfile", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")], {
        encoding: "utf8", timeout: 10_000,
        env: { ...process.env, GAMEHUB_LAUNCHER_TEST_PATH: path.resolve(__dirname, "../GameHub.ps1"),
          GAMEHUB_LAUNCHER_TEST_START_FAILS: String(startFails), GAMEHUB_LAUNCHER_TEST_PREVIOUS_TRUST: previousTrust ?? "unset",
          GAMEHUB_LAUNCHER_TEST_OUTCOME: launchOutcome }
      });
      assert.equal(result.status, 0, result.stderr);
      const outcome = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
      assert.equal(outcome.trustDuringStart, "true");
      assert.equal(outcome.trustAfter, previousTrust);
      assert.deepEqual(outcome.urls.filter(Boolean), startFails || metadataFails ? [] : ["https://fresh-tunnel.trycloudflare.com"]);
      if (!startFails && !metadataFails) assert.match(outcome.logCommands[0], /--since 2026-10-26T12:00:00.000000000Z/);
    });
  }
}
