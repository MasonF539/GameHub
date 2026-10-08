import type { GameDefinition } from "./gameDefinition.js";

export const gameHubGameApiVersion = 1 as const;

export type EmbeddedGameClient = {
  delivery: "embedded";
  markupPath?: string;
  entryPaths?: string[];
  stylePaths?: string[];
};

export type ModuleGameClient = {
  delivery: "module";
  entryPath: string;
  markupPath?: string;
  entryPaths?: string[];
  stylePaths?: string[];
};

export type GameClientDelivery = EmbeddedGameClient | ModuleGameClient;

export type GamePluginManifest = {
  apiVersion: typeof gameHubGameApiVersion;
  packageVersion: string;
  definition: GameDefinition;
  client: GameClientDelivery;
};

export type GamePluginPackage = {
  manifest: GamePluginManifest;
  publicDirectory: string;
};
