import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
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
const exactVersionPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

const rootPackage = JSON.parse(
  readFileSync(path.join(workspaceRoot, "package.json"), "utf8")
);
const gameHubConfiguration = JSON.parse(
  readFileSync(path.join(workspaceRoot, "gamehub.config.json"), "utf8")
);
assert.ok(
  Array.isArray(gameHubConfiguration.gamePackages),
  "gamehub.config.json must contain a gamePackages array."
);
const gamePackageNames = gameHubConfiguration.gamePackages;
assert.equal(
  gamePackageNames.every(
    (packageName) =>
      typeof packageName === "string" && packageName.trim() === packageName && packageName !== ""
  ),
  true,
  "Every configured game package must be a non-empty, trimmed package name."
);
assert.equal(
  new Set(gamePackageNames).size,
  gamePackageNames.length,
  "Configured game package names must be unique."
);

const gamePackageSpecs = gamePackageNames.map((packageName) => {
  const version = rootPackage.dependencies?.[packageName];
  assert.match(
    version ?? "",
    exactVersionPattern,
    `${packageName} must be an exact version in GameHub dependencies.`
  );
  return { packageName, version, packageSpec: `${packageName}@${version}` };
});

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

function pack(packageSpec) {
  const output = runNpm([
    "pack",
    packageSpec,
    "--json",
    "--pack-destination",
    artifactDirectory
  ]);
  const [packed] = JSON.parse(output);
  assert.ok(packed?.filename, `npm did not report an artifact for ${packageSpec}.`);
  return {
    archivePath: path.join(artifactDirectory, packed.filename),
    files: packed.files.map((file) => file.path)
  };
}

function assertPublishSafe(artifact, packageSpec) {
  assert.ok(
    artifact.files.includes("dist/index.js"),
    `${packageSpec} must publish dist/index.js.`
  );
  assert.ok(
    artifact.files.includes("dist/index.d.ts"),
    `${packageSpec} must publish dist/index.d.ts.`
  );
  assert.ok(
    artifact.files.includes("LICENSE"),
    `${packageSpec} must publish its LICENSE.`
  );
  assert.equal(
    artifact.files.some(
      (file) => file.startsWith("src/") || file.startsWith("test/")
    ),
    false,
    `${packageSpec} must not publish source or test directories.`
  );
}

function assertPublicFile(gamePackage, relativePath, field) {
  assert.ok(
    existsSync(path.join(gamePackage.publicDirectory, relativePath)),
    `${gamePackage.manifest.definition.id} is missing ${field}: ${relativePath}.`
  );
}

try {
  mkdirSync(artifactDirectory);
  mkdirSync(consumerDirectory);
  const sdk = pack(path.join(workspaceRoot, "packages", "game-sdk"));
  const gameArtifacts = gamePackageSpecs.map(({ packageSpec }) => ({
    packageSpec,
    artifact: pack(packageSpec)
  }));

  assertPublishSafe(sdk, "@masonf539/game-sdk workspace");
  for (const { packageSpec, artifact } of gameArtifacts) {
    assertPublishSafe(artifact, packageSpec);
  }

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
    ...gameArtifacts.map(({ artifact }) => artifact.archivePath)
  ], consumerDirectory);

  const requireFromConsumer = createRequire(
    path.join(consumerDirectory, "package.json")
  );
  const { GamePluginRegistry } = requireFromConsumer("@masonf539/game-sdk");
  const registry = new GamePluginRegistry();
  for (const { packageName, version } of gamePackageSpecs) {
    const installedGame = requireFromConsumer(packageName);
    const gamePackage = installedGame.gameHubPlugin;
    assert.ok(gamePackage, `${packageName} must export gameHubPlugin.`);
    assert.equal(
      typeof gamePackage.server?.createSession,
      "function",
      `${packageName} must export a server session factory.`
    );

    const manifest = gamePackage.manifest;
    const gameId = manifest?.definition?.id;
    assert.deepEqual(
      gamePackage.server.manifest,
      manifest,
      `${packageName} has mismatched client and server manifests.`
    );
    assert.equal(
      manifest.packageVersion,
      version,
      `${packageName} manifest version must match its installed version.`
    );
    registry.register(manifest);

    assert.ok(
      typeof gamePackage.publicDirectory === "string" &&
        existsSync(gamePackage.publicDirectory),
      `${packageName} must export an existing publicDirectory.`
    );
    if (manifest.client.markupPath) {
      assertPublicFile(gamePackage, manifest.client.markupPath, "client markup");
    }
    for (const entryPath of manifest.client.entryPaths ?? []) {
      assertPublicFile(gamePackage, entryPath, "classic client entry");
    }
    for (const stylePath of manifest.client.stylePaths ?? []) {
      assertPublicFile(gamePackage, stylePath, "client stylesheet");
    }
    if (manifest.client.delivery === "module") {
      assertPublicFile(gamePackage, manifest.client.entryPath, "module client entry");
    }
    if (manifest.definition.preview) {
      const previewPrefix = `/games/${gameId}/`;
      for (const previewPath of [
        manifest.definition.preview.videoPath,
        manifest.definition.preview.posterPath
      ]) {
        assert.ok(
          previewPath.startsWith(previewPrefix),
          `${packageName} preview must be inside ${previewPrefix}.`
        );
        assertPublicFile(
          gamePackage,
          previewPath.slice(previewPrefix.length),
          "picker preview"
        );
      }
    }
  }

  console.log(
    `Verified the GameHub SDK artifact and ${gamePackageSpecs.length} configured game package(s).`
  );
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
