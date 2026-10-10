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

export type GameStateEnvelope = {
  gameId: string;
  state: unknown;
};

export type GameEventEnvelope = {
  gameId: string;
  event: GameEvent;
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
  randomInteger(maxExclusive: number): number;
};

export type GameLifecycleState = {
  isPaused: boolean;
  isBusy: boolean;
};

export interface GameSession {
  start?(): void;
  getPublicState(viewer: GameViewer): unknown;
  getLifecycleState(): GameLifecycleState;
  handleAction(
    memberId: string,
    action: GameActionEnvelope
  ): GameActionResult | Promise<GameActionResult>;
  pause?(): GameActionResult;
  resume?(): GameActionResult;
  memberDisconnected?(memberId: string): void;
  memberReconnected?(memberId: string, previousMemberId?: string): void;
  /**
   * A member is leaving the game. `voluntary` is true when they left on
   * their own (they may still be connected) and false when the host removed
   * a disconnected player.
   */
  memberRemoved?(
    memberId: string,
    options?: { voluntary?: boolean }
  ): GameActionResult;
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
  registerEffect(
    name: string,
    options: { source: string; category?: "music" | "join" | "game"; volume?: number }
  ): void;
  registerMusicScene(name: string, source: string): void;
  setScene(scene: string | null): void;
};

export type GameClientContext = {
  root: HTMLElement;
  gameId: string;
  memberId: string;
  role: GameMemberRole;
  isHost: boolean;
  launchData: unknown;
  audio: GameAudioApi;
  submitAction(action: GameActionEnvelope): Promise<GameActionResult>;
  requestPause(isPaused: boolean): Promise<GameActionResult>;
  sendChat(message: string): Promise<GameActionResult>;
  removeMember(memberId: string): Promise<GameActionResult>;
  /** Leaves the room (not available to the host, who closes the lobby). */
  requestLeave(): Promise<GameActionResult>;
  notify(message: string): void;
  requestExit(): void;
};

export type GamePlatformEvent = {
  type: "spectators" | "chat-message";
  payload: unknown;
};

export interface GameClientInstance {
  receiveState(state: unknown): void;
  receiveEvent(event: GameEvent): void;
  receivePlatformEvent?(event: GamePlatformEvent): void;
  setPaused?(isPaused: boolean): void;
  destroy(): void;
}

export interface GameClientModule {
  mount(context: GameClientContext): GameClientInstance;
}
