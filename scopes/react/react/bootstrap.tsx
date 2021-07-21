import React from 'react';
import ReactDOM from 'react-dom';
import { RenderingContext } from '@teambit/preview';

import { CompositionsApp } from './compositions-app';

/**
 * this mounts compositions into the DOM in the component preview.
 * this function can be overridden through ReactAspect.overrideCompositionsMounter() API
 * to apply custom logic for component DOM mounting.
 */
export default (Composition: React.ComponentType, previewContext: RenderingContext) => {
  ReactDOM.render(
    <CompositionsApp Composition={Composition} previewContext={previewContext} />,
    document.getElementById('root')
  );
};
