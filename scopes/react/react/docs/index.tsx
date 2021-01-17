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
    // this can happen when re-rendering the page,
    // i.e. when only the hash part of the url changes
    render();
  }

  function render() {
    firstTime = false;

    ReactDOM.render(
      <DocsApp Provider={Provider} compositions={compositions} docs={docs} componentId={componentId} />,
      document.getElementById('root')
    );
  }
}

// hot reloading works when components are in a different file.
// do not declare react components here.
