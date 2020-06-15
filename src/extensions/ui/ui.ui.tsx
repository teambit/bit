import React from 'react';
import ReactDOM from 'react-dom';
import { Slot } from '@teambit/harmony';
import { WorkspaceUI } from '../workspace/workspace.ui';
import { GraphQlUI } from '../graphql/graphql.ui';
import { GraphQLProvider } from '../graphql/graphql-provider';
// import * as serviceWorker from './serviceWorker';

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://bit.ly/CRA-PWA
// serviceWorker.unregister();
/**
 * extension
 */
export class UIRuntimeExtension {
  static dependencies = [WorkspaceUI, GraphQlUI];

  constructor(
    /**
     * workspace UI extension.
     */
    private workspace: WorkspaceUI,

    /**
     * GraphQL extension.
     */
    private graphql: GraphQlUI
  ) {}

  render() {
    const Workspace = this.workspace.getMain();
    const GraphqlProvider = this.graphql.getProvider;

    ReactDOM.render(
      <React.StrictMode>
        <GraphqlProvider>
          <Workspace />
        </GraphqlProvider>
      </React.StrictMode>,
      document.getElementById('root')
    );
  }

  static async provider([workspace, graphql]: [WorkspaceUI, GraphQlUI]) {
    return new UIRuntimeExtension(workspace, graphql);
  }
}
