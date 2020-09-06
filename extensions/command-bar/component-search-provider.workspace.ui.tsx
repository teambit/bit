import React from 'react';
import Fuse from 'fuse.js';
import { CommandBarAspect, CommandBarUI, SearchProvider } from './aspect';
import { WorkspaceAspect, WorkspaceUI } from '../workspace';
import { ComponentModel } from '../component/ui';
import { ComponentID } from '../component';
import { ComponentItem } from './ui/component-item';
import { ReactRouterAspect, ReactRouterUI } from '../react-router';

// @TODO!
function componentToUrl(component: any) {
  throw new Error('not implemented');
  return '/';
}

/** Go-to-component autocomplete provider for Command bar, in workspace environment */
export default class ComponentSearchProvider implements SearchProvider {
  static dependencies = [CommandBarAspect, WorkspaceAspect, ReactRouterAspect];
  static slots = [];
  static async provider(
    [commandBarUI, workspaceUI, reactRouterUI]: [CommandBarUI, WorkspaceUI, ReactRouterUI] /* config, slots: [] */
  ) {
    const commandSearcher = new ComponentSearchProvider(workspaceUI, reactRouterUI);
    commandBarUI.addSearcher(commandSearcher);
    return commandSearcher;
  }
  constructor(private workspaceUI: WorkspaceUI, private reactRouterUI: ReactRouterUI) {}

  private fuseComponents = new Fuse<ComponentModel>([], {
    // weight can be included here.
    // fields loses weight the longer it gets, so it seems ok for now.
    keys: ['id.fullName'],
  });

  /** indicates this searcher supports terms in similar to component id */
  test(term: string): boolean {
    return !term.startsWith('>') && term.length > 0;
  }

  /** finds components similar to patterns */
  search = (pattern: string, limit: number) => {
    this.refreshComponents();

    const searchResults = this.fuseComponents.search(pattern, { limit });

    return searchResults.map((x) => (
      <ComponentItem key={x.item.id.toString()} component={x.item} execute={() => this.execute(x.item.id)} />
    ));
  };

  private execute = (componentId: ComponentID) => {
    const path = componentToUrl(componentId);
    this.reactRouterUI.push(path);
  };

  private _prevList?: ComponentModel[] = undefined;
  private refreshComponents() {
    const components = this.workspaceUI.listComponents();
    if (!components) {
      this._prevList = undefined;
      return;
    }

    if (this._prevList === components) return;

    this.fuseComponents.setCollection(components);
    this._prevList = components;
  }
}
