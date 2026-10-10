import type { GameDefinition, GameSetting } from "./gameDefinition.js";
import {
  gameHubGameApiVersion,
  type GamePluginManifest
} from "./manifest.js";

const identifierPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const settingKeyPattern = /^[A-Za-z][A-Za-z0-9]*$/;
const semanticVersionPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

export class GamePluginValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GamePluginValidationError";
  }
}

function requireNonEmpty(value: string, field: string): void {
  if (value.trim().length === 0) {
    throw new GamePluginValidationError(`${field} cannot be empty.`);
  }
}

function validatePublicPath(value: string, field: string): void {
  requireNonEmpty(value, field);
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value) ||
    value.startsWith("/") ||
    value.includes("\\") ||
    value.split("/").includes("..")
  ) {
    throw new GamePluginValidationError(`${field} must be package-relative.`);
  }
}

// Preview media is addressed by absolute site path inside the game's own
// folder, e.g. /games/<id>/assets/preview.mp4. It ends up in a CSS url(), so
// only plain path characters are allowed.
function validatePreviewPath(
  value: string,
  gameId: string,
  field: string
): void {
  requireNonEmpty(value, field);
  const prefix = `/games/${gameId}/`;

  if (
    !value.startsWith(prefix) ||
    !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value.slice(prefix.length)) ||
    value.split("/").includes("..")
  ) {
    throw new GamePluginValidationError(
      `${field} must be a path inside ${prefix}.`
    );
  }
}

function validateSetting(setting: GameSetting, gameId: string): void {
  const settingKey = setting.key;
  const defaultValue: unknown = setting.defaultValue;

  if (!settingKeyPattern.test(settingKey)) {
    throw new GamePluginValidationError(
      `${gameId} has an invalid setting key: ${settingKey}.`
    );
  }

  requireNonEmpty(setting.label, `${gameId}.${settingKey} label`);
  requireNonEmpty(setting.description, `${gameId}.${settingKey} description`);

  if (setting.type !== "number") {
    if (typeof defaultValue !== "boolean") {
      throw new GamePluginValidationError(
        `${gameId}.${settingKey} must have a boolean default.`
      );
    }
    return;
  }

  if (typeof defaultValue !== "number" || !Number.isFinite(defaultValue)) {
    throw new GamePluginValidationError(
      `${gameId}.${settingKey} must have a finite numeric default.`
    );
  }

  if (setting.control === "range") {
    if (
      !Number.isFinite(setting.min) ||
      !Number.isFinite(setting.max) ||
      !Number.isFinite(setting.step) ||
      setting.min > setting.max ||
      setting.step <= 0 ||
      defaultValue < setting.min ||
      defaultValue > setting.max
    ) {
      throw new GamePluginValidationError(
        `${gameId}.${settingKey} has an invalid numeric range.`
      );
    }
    return;
  }

  if (
    setting.options.length === 0 ||
    setting.options.some((option) => !Number.isFinite(option)) ||
    new Set(setting.options).size !== setting.options.length ||
    !setting.options.includes(defaultValue)
  ) {
    throw new GamePluginValidationError(
      `${gameId}.${settingKey} has invalid select options.`
    );
  }
}

export function validateGamePluginManifest(manifest: GamePluginManifest): void {
  if (manifest.apiVersion !== gameHubGameApiVersion) {
    throw new GamePluginValidationError(
      `Unsupported GameHub game API version: ${manifest.apiVersion}.`
    );
  }

  if (!semanticVersionPattern.test(manifest.packageVersion)) {
    throw new GamePluginValidationError(
      `Invalid game package version: ${manifest.packageVersion}.`
    );
  }

  const game = manifest.definition;
  if (!identifierPattern.test(game.id)) {
    throw new GamePluginValidationError(`Invalid game id: ${game.id}.`);
  }

  requireNonEmpty(game.name, `${game.id} name`);
  requireNonEmpty(game.description, `${game.id} description`);

  if (
    !Number.isInteger(game.minPlayers) ||
    !Number.isInteger(game.maxPlayers) ||
    game.minPlayers < 1 ||
    game.maxPlayers < game.minPlayers
  ) {
    throw new GamePluginValidationError(`${game.id} has invalid player limits.`);
  }

  if (game.preview) {
    validatePreviewPath(
      game.preview.videoPath,
      game.id,
      `${game.id} preview video path`
    );
    validatePreviewPath(
      game.preview.posterPath,
      game.id,
      `${game.id} preview poster path`
    );
  }

  const settingKeys = new Set<string>();
  for (const setting of game.settings) {
    if (settingKeys.has(setting.key)) {
      throw new GamePluginValidationError(
        `${game.id} has a duplicate setting key: ${setting.key}.`
      );
    }
    settingKeys.add(setting.key);
    validateSetting(setting, game.id);
  }

  if (manifest.client.delivery === "module") {
    validatePublicPath(
      manifest.client.entryPath,
      `${game.id} module entry path`
    );
  }

  if (manifest.client.markupPath) {
    validatePublicPath(manifest.client.markupPath, `${game.id} client markup path`);
  }
  for (const entryPath of manifest.client.entryPaths ?? []) {
    validatePublicPath(entryPath, `${game.id} client entry path`);
  }
  for (const stylePath of manifest.client.stylePaths ?? []) {
    validatePublicPath(stylePath, `${game.id} client style path`);
  }
}

export class GamePluginRegistry {
  readonly #manifests = new Map<string, GamePluginManifest>();

  constructor(manifests: Iterable<GamePluginManifest> = []) {
    for (const manifest of manifests) {
      this.register(manifest);
    }
  }

  register(manifest: GamePluginManifest): void {
    validateGamePluginManifest(manifest);
    const gameId = manifest.definition.id;

    if (this.#manifests.has(gameId)) {
      throw new GamePluginValidationError(
        `A game with id ${gameId} is already registered.`
      );
    }

    this.#manifests.set(gameId, manifest);
  }

  getManifest(gameId: string): GamePluginManifest | null {
    return this.#manifests.get(gameId) ?? null;
  }

  getDefinition(gameId: string): GameDefinition | null {
    return this.getManifest(gameId)?.definition ?? null;
  }

  listDefinitions(): GameDefinition[] {
    return Array.from(
      this.#manifests.values(),
      (manifest) => manifest.definition
    );
  }
}
