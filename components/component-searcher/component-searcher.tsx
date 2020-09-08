import Fuse from 'fuse.js';
import memoizeOne from 'memoize-one';
import { ComponentModel } from '@teambit/component';
import { SearchProvider, CommanderSearchResult } from '@teambit/command-bar';

export class ComponentSearcher implements SearchProvider {
  private fuseCommands = new Fuse<CommanderSearchResult>([], {
    // weight can be included here.
    // fields loses weight the longer it gets, so it seems ok for now.
    keys: ['name', 'description'],
  });

  constructor(components: ComponentModel[], private navigate: (path: string) => void) {
    this.update(components);
  }

  // this method can be called on every render. memoize to prevent redundant calls
  update = memoizeOne((components: ComponentModel[]) => {
    const { navigate } = this;

    const searchResults = components.map((c) => ({
      id: c.id.fullName,
      name: c.id.fullName,
      handler: () => navigate(`/${c.id.fullName}`),
    }));

    this.fuseCommands.setCollection(searchResults);
  });

  search(term: string, limit: number): CommanderSearchResult[] {
    const searchResults = this.fuseCommands.search(term, { limit });
    return searchResults.map((x) => x.item);
  }

  test(term: string): boolean {
    return !term.startsWith('>') && term.length > 0;
  }
}
