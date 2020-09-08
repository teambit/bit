import Fuse from 'fuse.js';
import { CommandObj } from '@teambit/commands';
import { SearchProvider, CommanderSearchResult } from '@teambit/command-bar';

export class CommandSearcher implements SearchProvider {
  private fuseCommands = new Fuse<CommandObj>([], {
    // weight can be included here.
    // fields loses weight the longer it gets, so it seems ok for now.
    keys: ['name', 'description'],
  });

  constructor(commands: CommandObj[]) {
    this.fuseCommands.setCollection(commands);
  }

  update(commands: CommandObj[]) {
    this.fuseCommands.setCollection(commands);
  }

  search(term: string, limit: number): CommanderSearchResult[] {
    const unprefixedPattern = term.replace(/^>/, '');
    const searchResults = this.fuseCommands.search(unprefixedPattern, { limit });
    return searchResults.map((x) => x.item);
  }

  test(term: string): boolean {
    return term.startsWith('>');
  }
}
