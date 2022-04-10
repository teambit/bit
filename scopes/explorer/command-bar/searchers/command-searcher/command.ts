export type Command = {
  id: string;
  displayName: string;
  action: Function;
  icon?: string;
  iconAlt?: string;
  keybinding?: string | string[];
};
