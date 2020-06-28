import React from 'react';
import ReactDOM from 'react-dom';

export class Preview {
  render() {
    ReactDOM.render(<div>hello from preview</div>, document.getElementById('root'));
  }

  static async provider() {
    return new Preview();
  }
}
