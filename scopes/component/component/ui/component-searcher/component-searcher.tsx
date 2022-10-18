import React from 'react';

import { ComponentModel } from '@teambit/component';
import { SearchResult, FuzzySearchItem, FuzzySearcher } from '@teambit/explorer.ui.command-bar';
import type { SearchProvider } from '@teambit/command-bar';
import { ComponentResult, ComponentResultPlugin } from './component-result';

export type { ComponentResultPlugin };

type ComponentSearchIdx = {
  name: string;
  displayName: string;
  component: ComponentModel;
};

const searchKeys: (keyof ComponentSearchIdx)[] = ['displayName', 'name'];

type ComponentSearcherOptions = {
  navigate: (path: string) => void;
  resultPlugins?: ComponentResultPlugin[];
};

export class ComponentSearcher extends FuzzySearcher<ComponentModel, ComponentSearchIdx> implements SearchProvider {
  constructor(public options: ComponentSearcherOptions) {
    super({ searchKeys });
  }

  updatePlugins(plugins: ComponentResultPlugin[]) {
    this.options = {
      ...this.options,
      resultPlugins: plugins,
    };
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
    const { navigate, resultPlugins } = this.options;
    const { component } = item;

    return {
      id: component.id.fullName,
      action: () => navigate(`/${component.id.fullName}`),
      children: <ComponentResult component={component} plugins={resultPlugins} />,
    };
  };
}
