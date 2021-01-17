import React from 'react';
import ReactDOM from 'react-dom';

import { DocsApp } from './docs-app';
import type { DocsFile } from './examples-overview/example';

let firstTime = true;

export default function DocsRoot(
  Provider: React.ComponentType,
  componentId: string,
  docs: DocsFile | undefined,
  compositions: any
) {
  if (firstTime && typeof window !== 'undefined') {
    window.addEventListener('load', render);
  } else {
    firstTime = false;
    render();
  }

  function render() {
    ReactDOM.render(
      <DocsApp Provider={Provider} compositions={compositions} docs={docs} componentId={componentId} />,
      document.getElementById('root')
    );
  }
}

// hot reloading works when components are in a different file.
// do not declare react components here.
