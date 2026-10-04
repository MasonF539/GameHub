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

export type NumberGameSetting =
  | SelectNumberGameSetting
  | RangeNumberGameSetting;

export type GameSetting =
  | BooleanGameSetting
  | NumberGameSetting;

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
};
