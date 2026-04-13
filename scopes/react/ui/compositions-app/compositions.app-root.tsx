import React from 'react';
import { createRoot } from 'react-dom/client';
import type { RenderingContext } from '@teambit/preview';

import { CompositionsApp } from './compositions-app';

let root;

/**
 * mounts compositions into the DOM in the component preview.
 */
export default (Composition: React.ComponentType, previewContext: RenderingContext) => {
  if (!root) {
    root = createRoot(document.getElementById('root')!);
  }
  root.render(<CompositionsApp Composition={Composition} previewContext={previewContext} />);
};
