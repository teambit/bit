import React from 'react';
import ReactDOM from 'react-dom';
import { StandaloneNotFoundPage } from '@teambit/ui.pages.standalone-not-found-page';
import { highlightComponents } from '@teambit/ui.component-highlighter';

export default (Composition: React.ComponentType = StandaloneNotFoundPage) => {
  highlightComponents();
  ReactDOM.render(<Composition />, document.getElementById('root'));
};
