import React from 'react';
import ReactDOM from 'react-dom';
import { StandaloneNotFoundPage } from '@teambit/ui.pages.not-found';

export default (Composition: React.ComponentType = StandaloneNotFoundPage) => {
  ReactDOM.render(<Composition />, document.getElementById('root'));
};
