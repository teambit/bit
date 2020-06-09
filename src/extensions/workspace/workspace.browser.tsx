import React from 'react';
import ReactDOM from 'react-dom';

export class WorkspaceBrowser {
  static async provider() {
    ReactDOM.render(<div>hi from workspace</div>, document.getElementById('root'));

    return new WorkspaceBrowser();
  }
}
