import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

const workspaceRoot = process.cwd();
const temporaryRoot = mkdtempSync(
  path.join(tmpdir(), "gamehub-package-check-")
);
const artifactDirectory = path.join(temporaryRoot, "artifacts");
const consumerDirectory = path.join(temporaryRoot, "consumer");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

function runNpm(arguments_, workingDirectory = workspaceRoot) {
  const result = spawnSync(npmCommand, arguments_, {
    cwd: workingDirectory,
    encoding: "utf8",
    shell: false
  });
  if (result.status !== 0) {
    throw new Error(
      `npm ${arguments_.join(" ")} failed.\n${result.stdout}\n${result.stderr}`
    );
  }
  return result.stdout;
}

function pack(packageDirectory) {
  const output = runNpm([
    "pack",
    packageDirectory,
    "--json",
    "--pack-destination",
    artifactDirectory
  ]);
  const [packed] = JSON.parse(output);
  assert.ok(packed?.filename, `npm did not report an artifact for ${packageDirectory}.`);
  return {
    archivePath: path.join(artifactDirectory, packed.filename),
    files: packed.files.map((file) => file.path)
  };
}

try {
  mkdirSync(artifactDirectory);
  mkdirSync(consumerDirectory);
  const sdk = pack(path.join(workspaceRoot, "packages", "game-sdk"));
  const egyptianWar = pack(path.join(workspaceRoot, "games", "egyptian-war"));

  assert.ok(sdk.files.includes("dist/index.js"));
  assert.ok(sdk.files.includes("dist/index.d.ts"));
  assert.ok(sdk.files.includes("LICENSE"));
  assert.ok(egyptianWar.files.includes("dist/index.js"));
  assert.ok(egyptianWar.files.includes("dist/index.d.ts"));
  assert.ok(egyptianWar.files.includes("LICENSE"));
  assert.ok(egyptianWar.files.includes("public/template.html"));
  assert.ok(egyptianWar.files.includes("public/client.js"));
  assert.ok(egyptianWar.files.includes("public/style.css"));
  assert.equal(
    [...sdk.files, ...egyptianWar.files].some(
      (file) => file.startsWith("src/") || file.startsWith("test/")
    ),
    false,
    "Published artifacts must not contain source or test directories."
  );

  writeFileSync(
    path.join(consumerDirectory, "package.json"),
    JSON.stringify({ name: "gamehub-package-consumer", private: true }, null, 2)
  );
  runNpm([
    "install",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    sdk.archivePath,
    egyptianWar.archivePath
  ], consumerDirectory);

  const requireFromConsumer = createRequire(
    path.join(consumerDirectory, "package.json")
  );
  const installedGame = requireFromConsumer("@gamehub/egyptian-war");
  assert.equal(installedGame.gameHubPlugin.manifest.definition.id, "egyptian-war");
  assert.equal(
    installedGame.gameHubPlugin.server.manifest.definition.id,
    "egyptian-war"
  );
  assert.ok(
    existsSync(
      path.join(installedGame.gameHubPlugin.publicDirectory, "template.html")
    )
  );

  console.log("Verified standalone SDK and Egyptian War npm artifacts.");
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
