import React, { ReactNode } from 'react';
import ReactDOM from 'react-dom';
import { Slot, SlotRegistry } from '@teambit/harmony';

import { WorkspaceUI } from '../workspace/workspace.ui';
import { GraphQlUI } from '../graphql/graphql.ui';
import { ReactRouterUI } from '../react-router/react-router.ui';
import { ClientContext } from './ui/client-context';
import { Compose } from './Compose';

// import * as serviceWorker from './serviceWorker';

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://bit.ly/CRA-PWA
// serviceWorker.unregister();

type ContextType = React.JSXElementConstructor<React.PropsWithChildren<any>>;

type HudSlot = SlotRegistry<ReactNode>;
type ContextSlot = SlotRegistry<ContextType>;

/**
 * extension
 */
export class UIRuntimeExtension {
  constructor(
    /**
     * workspace UI extension.
     */
    private workspace: WorkspaceUI,

    /**
     * GraphQL extension.
     */
    private graphql: GraphQlUI,

    /**
     * react-router extension.
     */
    private router: ReactRouterUI,

    private hudSlot: HudSlot,
    private contextSlot: ContextSlot
  ) {}

  render() {
    const GraphqlProvider = this.graphql.getProvider;
    const routes = this.router.renderRoutes();
    const hudItems = this.hudSlot.values();
    const contexts = this.contextSlot.values();

    ReactDOM.render(
      <GraphqlProvider>
        <ClientContext>
          <Compose components={contexts}>
            {hudItems}
            {routes}
          </Compose>
        </ClientContext>
      </GraphqlProvider>,
      document.getElementById('root')
    );
  }

  /** adds elements to the Heads Up Display */
  registerHudItem = (element: ReactNode) => {
    this.hudSlot.register(element);
  };

  //** adds global context at the ui root */
  registerContext(context: ContextType) {
    this.contextSlot.register(context);
  }

  static dependencies = [WorkspaceUI, GraphQlUI, ReactRouterUI];
  static slots = [Slot.withType<ReactNode>(), Slot.withType<ContextType>()];

  static async provider(
    [workspace, graphql, router]: [WorkspaceUI, GraphQlUI, ReactRouterUI],
    config,
    [hudSlot, contextSlot]: [SlotRegistry<ReactNode>, SlotRegistry<ContextType>]
  ) {
    return new UIRuntimeExtension(workspace, graphql, router, hudSlot, contextSlot);
  }
}
