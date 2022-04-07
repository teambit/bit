import Fuse from 'fuse.js';
import memoizeOne from 'memoize-one';
import { SearchResult } from './search-result';

type SearcherOptions = {
  /** properties to include in fuzzy search */
  searchKeys: Fuse.FuseOptionKey[];
};

export type FuzzySearchItem<T> = Fuse.FuseResult<T>;

// keep it simple!
/** a template for creating a command bar searcher.
 * Simply extend and implement the abstract methods, and fuse.js will take care of the rest
 */
export abstract class Searcher<Item, IndexedItem> {
  constructor(readonly baseSearcherOptions: SearcherOptions) {}

  private fuseCommands = new Fuse<IndexedItem>([], { keys: this.baseSearcherOptions.searchKeys });

  // this method could be called on every render. memoize to prevent redundant calls
  update = memoizeOne((components: Item[]) => {
    const searchResults = components.map(this.toSearchableItem);
    this.fuseCommands.setCollection(searchResults);
  });

  search(term: string, limit: number): SearchResult[] {
    const searchResults = this.fuseCommands.search(term, { limit });
    return searchResults.map(this.toSearchResult);
  }

  test?(term: string): boolean;
  protected abstract toSearchableItem(item: Item): IndexedItem;
  protected abstract toSearchResult(indexedItem: FuzzySearchItem<IndexedItem>): SearchResult;
}
