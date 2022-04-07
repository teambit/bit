import React from 'react';

import Fuse from 'fuse.js';
import memoizeOne from 'memoize-one';
import { ComponentModel } from '@teambit/component';
import { DeprecationIcon } from '@teambit/component.ui.deprecation-icon';
import { SearchProvider, CommanderSearchResult } from '../../types';
import { ComponentResult, ComponentResultSlots } from './component-result';

type ComponentSearchIdx = {
  name: string;
  displayName: string;
  component: ComponentModel;
};

const plugins: ComponentResultSlots[] = [{ key: 'deprecation', end: DeprecationIcon }];
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
        children: <ComponentResult component={component} plugins={plugins} />,
      };
    });
  }

  test(term: string): boolean {
    return !term.startsWith('>') && term.length > 0;
  }
}
