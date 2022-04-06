import React from 'react';
import Fuse from 'fuse.js';
import { CommanderSearchResult } from '@teambit/explorer.ui.command-bar';
import { SearchProvider } from '../../types';
import { CommandResult } from './command-result';
import { Command } from './command';

const searchedKeys: (keyof Command)[] = ['displayName'];

export class CommandSearcher implements SearchProvider {
  private fuseCommands = new Fuse<Command>([], {
    // weight can be included here.
    // fields loses weight the longer they get, so it seems ok for now.
    keys: searchedKeys,
  });

  constructor(commands: Command[]) {
    this.fuseCommands.setCollection(commands);
  }

  update(commands: Command[]) {
    this.fuseCommands.setCollection(commands);
  }

  search(term: string, limit: number): CommanderSearchResult[] {
    const unprefixedPattern = term.replace(/^>/, '');
    const searchResults = this.fuseCommands.search(unprefixedPattern, { limit });

    return searchResults.map(({ item }) => {
      return {
        id: item.id,
        handler: item.handler,
        children: <CommandResult command={item} />,
      };
    });
  }

  test(term: string): boolean {
    return term.startsWith('>');
  }
}
