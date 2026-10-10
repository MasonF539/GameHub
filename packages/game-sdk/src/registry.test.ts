import assert from "node:assert/strict";
import test from "node:test";
import type { GamePluginManifest } from "./manifest.js";
import {
  GamePluginRegistry,
  GamePluginValidationError,
  validateGamePluginManifest
} from "./registry.js";

function createManifest(): GamePluginManifest {
  return {
    apiVersion: 1,
    packageVersion: "1.2.3",
    client: {
      delivery: "module",
      entryPath: "client.js",
      stylePaths: ["style.css"]
    },
    definition: {
      id: "example-game",
      name: "Example Game",
      description: "A game used to verify the plugin registry.",
      isPlayable: true,
      chatEnabled: true,
      rules: ["Take a turn."],
      minPlayers: 2,
      maxPlayers: 4,
      settings: [
        {
          key: "friendlyMode",
          label: "Friendly Mode",
          description: "Keep the example friendly.",
          defaultValue: true
        },
        {
          type: "number",
          key: "rounds",
          label: "Rounds",
          description: "Number of rounds to play.",
          defaultValue: 3,
          options: [1, 3, 5]
        }
      ]
    }
  };
}

test("registers versioned game manifests and exposes public definitions", () => {
  const manifest = createManifest();
  const registry = new GamePluginRegistry([manifest]);

  assert.equal(registry.getManifest("example-game"), manifest);
  assert.equal(
    registry.getDefinition("example-game"),
    manifest.definition
  );
  assert.deepEqual(registry.listDefinitions(), [manifest.definition]);
  assert.equal(registry.getManifest("missing-game"), null);
});

test("rejects duplicate game ids", () => {
  const registry = new GamePluginRegistry([createManifest()]);

  assert.throws(
    () => registry.register(createManifest()),
    (error) =>
      error instanceof GamePluginValidationError &&
      /already registered/.test(error.message)
  );
});

test("rejects incompatible API and package versions", () => {
  const incompatible = createManifest() as unknown as {
    apiVersion: number;
  };
  incompatible.apiVersion = 2;
  assert.throws(
    () => validateGamePluginManifest(incompatible as GamePluginManifest),
    /Unsupported GameHub game API version/
  );

  const invalidVersion = createManifest();
  invalidVersion.packageVersion = "latest";
  assert.throws(
    () => validateGamePluginManifest(invalidVersion),
    /Invalid game package version/
  );
});

test("rejects malformed player limits and settings", () => {
  const invalidLimits = createManifest();
  invalidLimits.definition.maxPlayers = 1;
  assert.throws(
    () => validateGamePluginManifest(invalidLimits),
    /invalid player limits/
  );

  const duplicateSetting = createManifest();
  duplicateSetting.definition.settings.push({
    key: "friendlyMode",
    label: "Duplicate",
    description: "This key is already used.",
    defaultValue: false
  });
  assert.throws(
    () => validateGamePluginManifest(duplicateSetting),
    /duplicate setting key/
  );

  const invalidOptions = createManifest();
  const rounds = invalidOptions.definition.settings[1];
  if (rounds.type !== "number" || rounds.control === "range") {
    throw new Error("Expected a numeric select setting.");
  }
  rounds.options = [1, 5];
  assert.throws(
    () => validateGamePluginManifest(invalidOptions),
    /invalid select options/
  );

  const invalidPreview = createManifest();
  invalidPreview.definition.preview = {
    videoPath: "",
    posterPath: "/preview.webp"
  };
  assert.throws(
    () => validateGamePluginManifest(invalidPreview),
    /preview video path cannot be empty/
  );
});

test("preview media must live inside the game's own public folder", () => {
  const valid = createManifest();
  valid.definition.preview = {
    videoPath: "/games/example-game/assets/preview.mp4",
    posterPath: "/games/example-game/assets/poster.webp"
  };
  assert.doesNotThrow(() => validateGamePluginManifest(valid));

  for (const badPath of [
    "https://example.com/poster.webp",
    "/games/other-game/assets/poster.webp",
    "/games/example-game/../other/poster.webp",
    "/games/example-game/assets/poster.webp\")",
    "/preview.webp"
  ]) {
    const invalid = createManifest();
    invalid.definition.preview = {
      videoPath: "/games/example-game/assets/preview.mp4",
      posterPath: badPath
    };
    assert.throws(
      () => validateGamePluginManifest(invalid),
      /preview poster path must be a path inside/,
      `${badPath} should be rejected`
    );
  }
});
