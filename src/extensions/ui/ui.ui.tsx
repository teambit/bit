import React from 'react';
import ReactDOM from 'react-dom';
import { Slot, SlotRegistry } from '@teambit/harmony';
import { UIRoot } from './ui-root.ui';
import { GraphQlUI } from '../graphql/graphql.ui';
import { ReactRouterUI } from '../react-router/react-router.ui';
import { ClientContext } from './ui/client-context';

export type UIRootRegistry = SlotRegistry<UIRoot>;

// import * as serviceWorker from './serviceWorker';

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://bit.ly/CRA-PWA
// serviceWorker.unregister();
/**
 * extension
 */
export class UIRuntimeExtension {
  constructor(
    /**
     * GraphQL extension.
     */
    private graphql: GraphQlUI,

    /**
     * react-router extension.
     */
    private router: ReactRouterUI,

    /**
     * ui root registry.
     */
    private uiRootSlot: UIRootRegistry
  ) {}

  render(rootExtension: string) {
    const GraphqlProvider = this.graphql.getProvider;
    const root = this.getRoot(rootExtension);
    if (!root) throw new Error(`root: ${root} was not found`);
    const routes = this.router.renderRoutes(root.routes);

    ReactDOM.render(
      <GraphqlProvider>
        <ClientContext>{routes}</ClientContext>
      </GraphqlProvider>,
      document.getElementById('root')
    );
  }

  registerRoot(uiRoot: UIRoot) {
    return this.uiRootSlot.register(uiRoot);
  }

  private getRoot(rootExtension: string) {
    return this.uiRootSlot.get(rootExtension);
  }

  static slots = [Slot.withType<UIRoot>()];

  static dependencies = [GraphQlUI, ReactRouterUI];

  static async provider([graphql, router]: [GraphQlUI, ReactRouterUI], config, [uiRootSlot]: [UIRootRegistry]) {
    return new UIRuntimeExtension(graphql, router, uiRootSlot);
  }
}
