import React from 'react';

import { ComponentModel } from '@teambit/component';
import { Searcher, SearchResult, FuzzySearchItem } from '@teambit/explorer.ui.command-bar';
import { DeprecationIcon } from '@teambit/component.ui.deprecation-icon';
import { SearchProvider } from '../../types';
import { ComponentResult, ComponentResultSlots } from './component-result';

type ComponentSearchIdx = {
  name: string;
  displayName: string;
  component: ComponentModel;
};

const plugins: ComponentResultSlots[] = [{ key: 'deprecation', end: DeprecationIcon }];
const searchKeys: (keyof ComponentSearchIdx)[] = ['displayName', 'name'];

export class ComponentSearcher extends Searcher<ComponentModel, ComponentSearchIdx> implements SearchProvider {
  constructor(private navigate: (path: string) => void) {
    super({ searchKeys });
  }

  override test(term: string): boolean {
    return !term.startsWith('>') && term.length > 0;
  }

  protected override toSearchableItem(item: ComponentModel): ComponentSearchIdx {
    return {
      name: item.id.name,
      displayName: item.id.fullName,
      component: item,
    };
  }

  protected override toSearchResult = ({ item }: FuzzySearchItem<ComponentSearchIdx>): SearchResult => {
    const { navigate } = this;
    const { component } = item;

    return {
      id: component.id.fullName,
      action: () => navigate(`/${component.id.fullName}`),
      children: <ComponentResult component={component} plugins={plugins} />,
    };
  };
}
