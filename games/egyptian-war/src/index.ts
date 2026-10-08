import path from "node:path";
import type { GamePluginPackage } from "@gamehub/game-sdk";
import { egyptianWarManifest as manifest } from "./definition.js";

export {
  egyptianWar,
  egyptianWarManifest,
  type Card,
  type CardRank,
  type CardSuit
} from "./definition.js";
export {
  applyEgyptianWarAction,
  createDeck,
  createEgyptianWarState,
  createPublicEgyptianWarState,
  isEgyptianWarPileSlappable,
  removeEgyptianWarPlayer,
  resolveEgyptianWarTurnTimeout,
  shuffleDeck,
  EgyptianWarRuleError,
  type EgyptianWarAction,
  type EgyptianWarPlayerInput,
  type EgyptianWarSettings,
  type EgyptianWarState,
  type PublicEgyptianWarState
} from "./engine.js";
export {
  defaultSlapJitterMs,
  getSlapComparisonWindow,
  selectWeightedSlapWinner,
  slapCollectionWindowMs
} from "./slapArbitration.js";

export const gameHubPlugin: GamePluginPackage = {
  manifest,
  publicDirectory: path.resolve(__dirname, "..", "public")
};
