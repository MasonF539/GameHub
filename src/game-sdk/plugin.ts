import type { GameSettingValue } from "./gameDefinition.js";
import type { GamePluginManifest } from "./manifest.js";

export type GameMemberRole = "player" | "spectator";

export type GameMember = {
  id: string;
  name: string;
  avatar: string;
  isConnected: boolean;
  role: GameMemberRole;
};

export type GameViewer = {
  memberId: string;
  role: GameMemberRole;
};

export type GameActionEnvelope = {
  type: string;
  payload?: unknown;
};

export type GameActionResult = {
  success: boolean;
  message?: string;
};

export type GameEvent = {
  type: string;
  payload?: unknown;
};

export type GameCompletion = {
  winnerId: string | null;
  reason: string;
};

export type GameSessionContext = {
  roomCode: string;
  members: () => readonly GameMember[];
  broadcastState: () => void;
  emitEvent: (event: GameEvent) => void;
  finish: (completion: GameCompletion) => void;
  now: () => number;
  random: () => number;
};

export interface GameSession {
  getPublicState(viewer: GameViewer): unknown;
  handleAction(
    memberId: string,
    action: GameActionEnvelope
  ): GameActionResult | Promise<GameActionResult>;
  pause?(): void;
  resume?(): void;
  memberDisconnected?(memberId: string): void;
  memberReconnected?(memberId: string): void;
  memberRemoved?(memberId: string): void;
  dispose(): void;
}

export interface GameServerPlugin {
  manifest: GamePluginManifest;
  createSession(
    context: GameSessionContext,
    settings: Readonly<Record<string, GameSettingValue>>
  ): GameSession;
}

export type GameAudioApi = {
  playEffect(name: string): void;
  setScene(scene: string | null): void;
};

export type GameClientContext = {
  root: HTMLElement;
  gameId: string;
  memberId: string;
  role: GameMemberRole;
  audio: GameAudioApi;
  submitAction(action: GameActionEnvelope): Promise<GameActionResult>;
  requestExit(): void;
};

export interface GameClientInstance {
  receiveState(state: unknown): void;
  receiveEvent(event: GameEvent): void;
  setPaused?(isPaused: boolean): void;
  destroy(): void;
}

export interface GameClientModule {
  mount(context: GameClientContext): GameClientInstance;
}
