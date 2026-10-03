export type BooleanGameSetting = {
  key: string;
  label: string;
  description: string;
  defaultValue: boolean;
};

export type GameDefinition = {
  id: string;
  name: string;
  description: string;
  rules: string[];
  minPlayers: number;
  maxPlayers: number;
  settings: BooleanGameSetting[];
};