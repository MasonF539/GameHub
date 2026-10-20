export type BooleanGameSetting = {
  type?: "boolean";
  key: string;
  label: string;
  description: string;
  defaultValue: boolean;
};

export type SelectNumberGameSetting = {
  type: "number";
  control?: "select";
  key: string;
  label: string;
  description: string;
  defaultValue: number;
  options: number[];
  unit?: string;
};

export type RangeNumberGameSetting = {
  type: "number";
  control: "range";
  key: string;
  label: string;
  description: string;
  defaultValue: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
};

export type NumberGameSetting = SelectNumberGameSetting | RangeNumberGameSetting;
export type GameSetting = BooleanGameSetting | NumberGameSetting;
export type GameSettingValue = boolean | number;

export type GamePreview = {
  videoPath: string;
  posterPath: string;
};

export type GameKeybind = {
  /** Stable action id used by the game client, such as "play-card". */
  id: string;
  label: string;
  description?: string;
  /**
   * Assignable KeyboardEvent.code value. Tab, function keys, and standalone
   * modifier keys are reserved by GameHub.
   */
  defaultKey: string;
};

export type GameDefinition = {
  id: string;
  name: string;
  description: string;
  isPlayable: boolean;
  chatEnabled: boolean;
  rules: string[];
  minPlayers: number;
  maxPlayers: number;
  settings: GameSetting[];
  keybinds?: GameKeybind[];
  /** Personal browser preferences; never authoritative match rules. */
  displayOptions?: GameDisplayOption[];
  /** Room-only totals. The host awards wins; games report other declared keys. */
  scoreboard?: Array<{ key: string; label: string; sort?: "asc" | "desc" }>;
  preview?: GamePreview;
};

export type GameDisplayOption = {
  key: string;
  label: string;
  defaultValue: string;
  choices: Array<{ value: string; label: string; previewPath?: string }>;
};
