export type CommandHandler = (...arg: any[]) => any;
export type Keybinding = string | string[]; // TODO

export type CommanderSearchResult = {
  id: string;
  displayName: string;
  handler: CommandHandler;
  icon?: string;
  iconAlt?: string;
  keybinding?: Keybinding;
};
