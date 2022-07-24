import { SearchResult } from '@teambit/explorer.ui.command-bar';

export interface SearchProvider {
  /** provide completions for this search term */
  search(term: string, limit: number): SearchResult[] | Promise<SearchResult[]>;
  /** determines what terms are handled by this searcher. */
  test(term: string): boolean;
}
