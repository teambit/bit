import React from 'react';
import ReactDOM from 'react-dom';
import { RenderingContext } from '@teambit/preview';

import { CompositionsApp } from './compositions-app';

/**
 * mounts compositions into the DOM in the component preview.
 */
export default (Composition: React.ComponentType, previewContext: RenderingContext) => {
  ReactDOM.render(
    <CompositionsApp Composition={Composition} previewContext={previewContext} />,
    document.getElementById('root')
  );
};
