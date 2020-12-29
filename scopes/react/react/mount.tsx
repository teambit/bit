import React from 'react';
import ReactDOM from 'react-dom';
import { StandaloneNotFoundPage } from '@teambit/ui.pages.standalone-not-found-page';
import { initiate } from '@teambit/ui.component-highlighter';

export default (Composition: React.ComponentType = StandaloneNotFoundPage) => {
  initiate();
  ReactDOM.render(<Composition />, document.getElementById('root'));
};
