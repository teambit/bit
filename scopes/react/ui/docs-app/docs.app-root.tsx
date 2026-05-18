import type { DocsRootProps } from '@teambit/docs';
import React from 'react';

import { DocsApp } from './docs-app';

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

function DocsRoot({ componentId, docs, compositions, context }: DocsRootProps) {
  if (!root) {
    root = createCompatRoot(document.getElementById('root')!);
  }
  root.render(<DocsApp componentId={componentId} docs={docs} compositions={compositions} context={context} />);
}

// For backward compatibility - can be removed end of 2022
DocsRoot.apiObject = true;

export default DocsRoot;

// hot reloading works when components are in a different file.
// do not declare react components here.
