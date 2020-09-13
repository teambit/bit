import Fuse from 'fuse.js';
import memoizeOne from 'memoize-one';
import { ComponentModel } from '@teambit/component';
import { SearchProvider, CommanderSearchResult } from '@teambit/command-bar';

const searchedKeys: (keyof CommanderSearchResult)[] = ['displayName'];

export class ComponentSearcher implements SearchProvider {
  // TODO @Ran - workaround - searcher is constructed once from workspace and once from scope
  private active = false;
  private fuseCommands = new Fuse<CommanderSearchResult>([], {
    // weight can be included here.
    // fields loses weight the longer it gets, so it seems ok for now.
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
    this.active = true;
  });

  search(term: string, limit: number): CommanderSearchResult[] {
    const searchResults = this.fuseCommands.search(term, { limit });
    return searchResults.map((x) => x.item);
  }

  test(term: string): boolean {
    return this.active && !term.startsWith('>') && term.length > 0;
  }
}
