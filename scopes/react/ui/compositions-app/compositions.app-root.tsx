import React from 'react';
import type { RenderingContext } from '@teambit/preview';

import { CompositionsApp } from './compositions-app';

type Root = { render: (element: React.ReactElement) => void };
let root: Root | undefined;

function createCompatRoot(container: HTMLElement): Root {
  try {
    // React 18+: react-dom/client exists and exports createRoot
    // eslint-disable-next-line import/no-extraneous-dependencies
    return require('react-dom/client').createRoot(container);
  } catch {
    // React 17 fallback: react-dom/client does not exist
    // eslint-disable-next-line import/no-extraneous-dependencies
    const ReactDOM = require('react-dom');
    return {
      render: (element) => {
        ReactDOM.render(element, container);
      },
    };
  }
}

/**
 * mounts compositions into the DOM in the component preview.
 */
export default (Composition: React.ComponentType, previewContext: RenderingContext) => {
  if (!root) {
    root = createCompatRoot(document.getElementById('root')!);
  }
  root.render(<CompositionsApp Composition={Composition} previewContext={previewContext} />);
};
