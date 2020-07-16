import React from 'react';
import ReactDOM from 'react-dom';
import { WorkspaceUI } from '../workspace/workspace.ui';
import { GraphQlUI } from '../graphql/graphql.ui';
import { ReactRouterUI } from '../react-router/react-router.ui';
import { ClientContext } from './ui/client-context';

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
    private router: ReactRouterUI
  ) {}

  render() {
    const GraphqlProvider = this.graphql.getProvider;
    const routes = this.router.renderRoutes();

    ReactDOM.render(
      <GraphqlProvider>
        <ClientContext>{routes}</ClientContext>
      </GraphqlProvider>,
      document.getElementById('root')
    );
  }

  static dependencies = [WorkspaceUI, GraphQlUI, ReactRouterUI];

  static async provider([workspace, graphql, router]: [WorkspaceUI, GraphQlUI, ReactRouterUI]) {
    return new UIRuntimeExtension(workspace, graphql, router);
  }
}
