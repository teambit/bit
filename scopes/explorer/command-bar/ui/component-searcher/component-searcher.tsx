import React from 'react';

import Fuse from 'fuse.js';
import memoizeOne from 'memoize-one';
import { ComponentModel } from '@teambit/component';
import { SearchProvider, CommanderSearchResult } from '../../types';
import { ComponentResult } from './component-result';

// type ComponentSearchResult = CommanderSearchResult & { name: string };

type ComponentSearchIdx = {
  name: string;
  displayName: string;
  component: ComponentModel;
};

const searchedKeys: (keyof ComponentSearchIdx)[] = ['displayName', 'name'];

export class ComponentSearcher implements SearchProvider {
  private fuseCommands = new Fuse<ComponentSearchIdx>([], {
    // weight can be included here.
    // fields loses weight the longer they get, so it seems ok for now.
    keys: searchedKeys,
  });

  constructor(private navigate: (path: string) => void) {}

  // this method can be called on every render. memoize to prevent redundant calls
  update = memoizeOne((components: ComponentModel[]) => {
    const searchResults = components.map((component) => ({
      name: component.id.name,
      displayName: component.id.fullName,
      component,
    }));

    this.fuseCommands.setCollection(searchResults);
  });

  search(term: string, limit: number): CommanderSearchResult[] {
    const { navigate } = this;

    const searchResults = this.fuseCommands.search(term, { limit });
    return searchResults.map(({ item }) => {
      const { component } = item;

      return {
        id: component.id.fullName,
        handler: () => navigate(`/${component.id.fullName}`),
        children: <ComponentResult component={component} />,
      };
    });
  }

  test(term: string): boolean {
    return !term.startsWith('>') && term.length > 0;
  }
}
