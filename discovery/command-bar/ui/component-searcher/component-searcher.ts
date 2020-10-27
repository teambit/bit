import Fuse from 'fuse.js';
import memoizeOne from 'memoize-one';
import { ComponentModel } from '@teambit/component';
import { SearchProvider, CommanderSearchResult } from '../../types';

const searchedKeys: (keyof CommanderSearchResult)[] = ['displayName'];

export class ComponentSearcher implements SearchProvider {
  private fuseCommands = new Fuse<CommanderSearchResult>([], {
    // weight can be included here.
    // fields loses weight the longer they get, so it seems ok for now.
    keys: searchedKeys,
  });

  constructor(private navigate: (path: string) => void) {}

  // this method can be called on every render. memoize to prevent redundant calls
  update = memoizeOne((components: ComponentModel[]) => {
    const { navigate } = this;

    const searchResults = components.map((c) => ({
      id: c.id.fullName,
      displayName: c.id.fullName,
      handler: () => navigate(`/${c.id.fullName}`),
      icon: c.environment?.icon,
      iconAlt: c.environment?.id,
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
