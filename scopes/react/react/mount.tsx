import React from 'react';
import ReactDOM from 'react-dom';
import { RenderingContext } from '@teambit/preview';
// this is here in order to make sure it get's into the composition chunk bundle because it's configured as external dependency for the components
import '@mdx-js/react';
import '@teambit/mdx.ui.mdx-scope-context';

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
