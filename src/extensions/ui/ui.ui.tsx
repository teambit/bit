import React from 'react';
import ReactDOM from 'react-dom';
import { WorkspaceUI } from '../workspace/workspace.ui';
// import * as serviceWorker from './serviceWorker';

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://bit.ly/CRA-PWA
// serviceWorker.unregister();
/**
 * extension
 */
export class UIRuntimeExtension {
  static dependencies = [WorkspaceUI];

  static async provider([workspace]: [WorkspaceUI]) {
    ReactDOM.render(<React.StrictMode>{workspace.render()}</React.StrictMode>, document.getElementById('root'));

    return new UIRuntimeExtension();
  }
}
