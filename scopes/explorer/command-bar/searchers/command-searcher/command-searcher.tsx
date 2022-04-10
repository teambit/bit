import React from 'react';
import { Searcher, SearchResult, FuzzySearchItem } from '@teambit/explorer.ui.command-bar';
import { SearchProvider } from '../search-provider';
import { CommandResult } from './command-result';
import { Command } from './command';

const searchKeys: (keyof Command)[] = ['displayName'];

export class CommandSearcher extends Searcher<Command, Command> implements SearchProvider {
  constructor(commands: Command[]) {
    super({ searchKeys });

    this.update(commands);
  }

  override test(term: string): boolean {
    return term.startsWith('>');
  }

  protected override toSearchableItem(item: Command) {
    return item;
  }

  protected override toSearchResult({ item }: FuzzySearchItem<Command>): SearchResult {
    return {
      id: item.id,
      action: item.action,
      children: <CommandResult command={item} />,
    };
  }
}
