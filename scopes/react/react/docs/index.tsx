import React from 'react';
import ReactDOM from 'react-dom';

import { DocsApp } from './docs-app';
import type { DocsFile } from './examples-overview/example';

export default function DocsRoot(
  Provider: React.ComponentType,
  componentId: string,
  docs: DocsFile | undefined,
  compositions: any
) {
  ReactDOM.render(
    <DocsApp Provider={Provider} compositions={compositions} docs={docs} componentId={componentId} />,
    document.getElementById('root')
  );
}

// hot reloading works when components are in a different file.
// do not declare react components here.
