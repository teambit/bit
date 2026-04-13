import type { DocsRootProps } from '@teambit/docs';
import React from 'react';
import { createRoot } from 'react-dom/client';

import { DocsApp } from './docs-app';

let root;

function DocsRoot({ componentId, docs, compositions, context }: DocsRootProps) {
  if (!root) {
    root = createRoot(document.getElementById('root')!);
  }
  root.render(<DocsApp componentId={componentId} docs={docs} compositions={compositions} context={context} />);
}

// For backward compatibility - can be removed end of 2022
DocsRoot.apiObject = true;

export default DocsRoot;

// hot reloading works when components are in a different file.
// do not declare react components here.
