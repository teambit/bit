// import { SearchResults } from '@teambit/command-bar';
import Fuse from 'fuse.js';
import memoizeOne from 'memoize-one';
import { SearchResult } from './search-result';
import { SearchResults } from './command-bar/use-searcher';

type SearcherOptions = {
  /** properties to include in fuzzy search */
  searchKeys: Fuse.FuseOptionKey[];
};

export type FuzzySearchItem<T> = Fuse.FuseResult<T>;

// keep it simple!
/** a template for creating a command bar searcher.
 * Simply extend and implement the abstract methods, and fuse.js will take care of the rest
 */
export abstract class FuzzySearcher<Item, IndexedItem> {
  constructor(readonly baseSearcherOptions: SearcherOptions) {}

  private fuseCommands = new Fuse<IndexedItem>([], { keys: this.baseSearcherOptions.searchKeys });

  // this method could be called on every render. memoize to prevent redundant calls
  update = memoizeOne((components: Item[]) => {
    const searchResults = components.map(this.toSearchableItem);
    this.fuseCommands.setCollection(searchResults);
  });

  search = memoizeOne((term: string, limit: number): SearchResults => {
    const searchResults = this.fuseCommands.search(term, { limit });
    return {
      items: searchResults.map(this.toSearchResult)
    };
  });

  test?(term: string): boolean;
  protected abstract toSearchableItem(item: Item): IndexedItem;
  protected abstract toSearchResult(indexedItem: FuzzySearchItem<IndexedItem>): SearchResult;
}
