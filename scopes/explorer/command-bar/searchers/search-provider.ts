import { SearchProvider as Searcher } from '@teambit/explorer.ui.command-bar';

export interface SearchProvider {
  /** provide completions for this search term */
  search: Searcher;
  /** determines what terms are handled by this searcher. */
  test(term: string): boolean;
}
