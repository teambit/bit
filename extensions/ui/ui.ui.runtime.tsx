import React, { ReactNode } from 'react';
import ReactDOM from 'react-dom';
import { Slot, SlotRegistry } from '@teambit/harmony';
import type { GraphqlUI } from '@teambit/graphql';
import { GraphqlAspect } from '@teambit/graphql';
import type { ReactRouterUI } from '@teambit/react-router';
import { ReactRouterAspect } from '@teambit/react-router';
import { ClientContext } from './ui/client-context';
import { Compose } from './compose';
import { UIAspect, UIRuntime } from './ui.aspect';
import { UIRootUI as UIRoot } from './ui-root.ui';

type HudSlot = SlotRegistry<ReactNode>;
type ContextSlot = SlotRegistry<ContextType>;
export type UIRootRegistry = SlotRegistry<UIRoot>;

type ContextType = React.JSXElementConstructor<React.PropsWithChildren<any>>;

// import * as serviceWorker from './serviceWorker';

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://bit.ly/CRA-PWA
// serviceWorker.unregister();

/**
 * extension
 */
export class UiUI {
  constructor(
    /**
     * GraphQL extension.
     */
    private graphql: GraphqlUI,

    /**
     * react-router extension.
     */
    private router: ReactRouterUI,
    /**
     * ui root registry.
     */
    private uiRootSlot: UIRootRegistry,
    /** slot for overlay ui elements */
    private hudSlot: HudSlot,
    /** slot for context provider elements */
    private contextSlot: ContextSlot
  ) {}

  render(rootExtension: string) {
    const GraphqlProvider = this.graphql.getProvider;
    const root = this.getRoot(rootExtension);
    if (!root) throw new Error(`root: ${root} was not found`);
    const routes = this.router.renderRoutes(root.routes);
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

  // ** adds global context at the ui root */
  registerContext(context: ContextType) {
    this.contextSlot.register(context);
  }

  registerRoot(uiRoot: UIRoot) {
    return this.uiRootSlot.register(uiRoot);
  }

  private getRoot(rootExtension: string) {
    return this.uiRootSlot.get(rootExtension);
  }

  static slots = [Slot.withType<UIRoot>(), Slot.withType<ReactNode>(), Slot.withType<ContextType>()];

  static dependencies = [GraphqlAspect, ReactRouterAspect];

  static runtime = UIRuntime;

  static async provider(
    [graphql, router]: [GraphqlUI, ReactRouterUI],
    config,
    [uiRootSlot, hudSlot, contextSlot]: [UIRootRegistry, HudSlot, ContextSlot]
  ) {
    return new UiUI(graphql, router, uiRootSlot, hudSlot, contextSlot);
  }
}

UIAspect.addRuntime(UiUI);
