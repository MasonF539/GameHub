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

test("display options validate defaults, unique choices, and package-owned previews", () => {
  const manifest = createManifest();
  manifest.definition.displayOptions = [{
    key: "tableColor", label: "Table color", defaultValue: "green",
    choices: [{ value: "green", label: "Green", previewPath: "/games/example-game/green.svg" }]
  }];
  assert.doesNotThrow(() => validateGamePluginManifest(manifest));
  const option = manifest.definition.displayOptions[0]!;
  option.defaultValue = "missing";
  assert.throws(() => validateGamePluginManifest(manifest), /invalid display choices/);
  option.defaultValue = "green";
  option.choices.push({ value: "green", label: "Duplicate" });
  assert.throws(() => validateGamePluginManifest(manifest), /invalid display choices/);
  option.choices.pop();
  option.choices[0]!.previewPath = "/games/another-game/preview.svg";
  assert.throws(() => validateGamePluginManifest(manifest), /path inside/);
});

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

test("validates game keybind action ids and defaults", () => {
  const valid = createManifest();
  valid.definition.keybinds = [
    { id: "primary-action", label: "Primary action", defaultKey: "Space" },
    { id: "secondary-action", label: "Secondary action", defaultKey: "KeyE" }
  ];
  assert.doesNotThrow(() => validateGamePluginManifest(valid));

  const duplicateAction = createManifest();
  duplicateAction.definition.keybinds = [
    { id: "act", label: "First", defaultKey: "Space" },
    { id: "act", label: "Second", defaultKey: "KeyE" }
  ];
  assert.throws(
    () => validateGamePluginManifest(duplicateAction),
    /duplicate keybind action id/
  );

  const duplicateDefault = createManifest();
  duplicateDefault.definition.keybinds = [
    { id: "first", label: "First", defaultKey: "Space" },
    { id: "second", label: "Second", defaultKey: "Space" }
  ];
  assert.throws(
    () => validateGamePluginManifest(duplicateDefault),
    /assigns Space to multiple actions/
  );

  for (const invalidKey of [
    "space", "not a key!", "Tab", "F5", "ShiftLeft", "ControlRight"
  ]) {
    const invalidDefault = createManifest();
    invalidDefault.definition.keybinds = [{
      id: "act",
      label: "Action",
      defaultKey: invalidKey
    }];
    assert.throws(
      () => validateGamePluginManifest(invalidDefault),
      /invalid default keybind/,
      `${invalidKey} should be rejected`
    );
  }

  const escapeDefault = createManifest();
  escapeDefault.definition.keybinds = [{
    id: "cancel",
    label: "Cancel",
    defaultKey: "Escape"
  }];
  assert.doesNotThrow(() => validateGamePluginManifest(escapeDefault));
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

test("scoreboards are optional and validate their declared columns", () => {
  const manifest = createManifest();
  manifest.definition.scoreboard = [{ key: "wins", label: "Wins" }, { key: "mistakes", label: "Mistakes", sort: "asc" }];
  assert.doesNotThrow(() => validateGamePluginManifest(manifest));
  manifest.definition.scoreboard.push({ key: "wins", label: "Duplicate" });
  assert.throws(() => validateGamePluginManifest(manifest), /Scoreboard keys/);
});


test("numeric settings reject defaults and choices the host cannot save", () => {
  const manifest = createManifest();
  const range = {
    type: "number" as const, control: "range" as const,
    key: "turnSeconds", label: "Turn seconds", description: "Turn duration.",
    defaultValue: 15, min: 5, max: 30, step: 5
  };
  manifest.definition.settings = [range];
  assert.doesNotThrow(() => validateGamePluginManifest(manifest));
  for (const invalid of [
    { defaultValue: 12 }, { defaultValue: 12.5 }, { min: 0.5 }, { max: 30.5 }, { step: 0.5 }
  ]) {
    manifest.definition.settings = [{ ...range, ...invalid }];
    assert.throws(() => validateGamePluginManifest(manifest), GamePluginValidationError);
  }
  manifest.definition.settings = [{
    type: "number", key: "rounds", label: "Rounds", description: "Round count.",
    defaultValue: 1, options: [1, 1.5, 2]
  }];
  assert.throws(() => validateGamePluginManifest(manifest), GamePluginValidationError);
});
