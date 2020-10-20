export type CommandId = string;
export type CommandHandler = (...arg: any[]) => any;

export type CommanderSearchResult = {
  id: string;
  displayName: string;
  handler: CommandHandler;
  icon?: string;
  iconAlt?: string;
  keybinding?: Keybinding;
};

export interface SearchProvider {
  /** provide completions for this search term */
  search(term: string, limit: number): CommanderSearchResult[];
  /** determines what terms are handled by this searcher. */
  test(term: string): boolean;
}

export type Keybinding = string | string[];
