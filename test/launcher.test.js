const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

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
