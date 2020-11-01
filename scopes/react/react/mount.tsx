import React from 'react';
import ReactDOM from 'react-dom';
import { StandaloneNotFoundPage } from '@teambit/ui.pages.standalone-not-found-page';

export default (Composition: React.ComponentType = StandaloneNotFoundPage) => {
  ReactDOM.render(<Composition />, document.getElementById('root'));
};
