import type { GameDefinition } from "./gameDefinition.js";

export const gameHubGameApiVersion = 1 as const;

export type EmbeddedGameClient = {
  delivery: "embedded";
};

export type ModuleGameClient = {
  delivery: "module";
  entryPath: string;
  stylePaths?: string[];
};

export type GameClientDelivery = EmbeddedGameClient | ModuleGameClient;

export type GamePluginManifest = {
  apiVersion: typeof gameHubGameApiVersion;
  packageVersion: string;
  definition: GameDefinition;
  client: GameClientDelivery;
};
