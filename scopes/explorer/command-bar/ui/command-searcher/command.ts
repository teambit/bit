export type Command = {
  id: string;
  displayName: string;
  handler: Function;
  icon?: string;
  iconAlt?: string;
  keybinding?: string | string[];
};
