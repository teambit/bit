import Fuse from 'fuse.js';
import { CommanderSearchResult, SearchProvider } from '../../types';

const searchedKeys: (keyof CommanderSearchResult)[] = ['displayName'];

export class CommandSearcher implements SearchProvider {
  private fuseCommands = new Fuse<CommanderSearchResult>([], {
    // weight can be included here.
    // fields loses weight the longer they get, so it seems ok for now.
    keys: searchedKeys,
  });

  constructor(commands: CommanderSearchResult[]) {
    this.fuseCommands.setCollection(commands);
  }

  update(commands: CommanderSearchResult[]) {
    this.fuseCommands.setCollection(commands);
  }

  search(term: string, limit: number): CommanderSearchResult[] {
    const unprefixedPattern = term.replace(/^>/, '');
    const searchResults = this.fuseCommands.search(unprefixedPattern, { limit });
    // @ts-ignore this shows error on Circle for some weird reason
    return searchResults.map((x) => x.item);
  }

  test(term: string): boolean {
    return term.startsWith('>');
  }
}
