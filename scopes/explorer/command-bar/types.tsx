import { SearchResult } from '@teambit/explorer.ui.command-bar';

export type { SearchResult };
export type CommandId = string;
export type CommandHandler = Function;

export type Keybinding = string | string[];

export interface SearchProvider {
  /** provide completions for this search term */
  search(term: string, limit: number): SearchResult[];
  /** determines what terms are handled by this searcher. */
  test(term: string): boolean;
}
