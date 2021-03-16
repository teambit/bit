import { RenderingContext } from '@teambit/preview';
import React from 'react';
import ReactDOM from 'react-dom';

import { DocsApp } from './docs-app';
import type { DocsFile } from './examples-overview/example';

export default function DocsRoot(
  Provider: React.ComponentType | undefined,
  componentId: string,
  docs: DocsFile | undefined,
  compositions: any,
  context: RenderingContext
) {
  ReactDOM.render(
    <DocsApp
      Provider={Provider}
      compositions={compositions}
      docs={docs}
      componentId={componentId}
      renderingContext={context}
    />,
    document.getElementById('root')
  );
}

// hot reloading works when components are in a different file.
// do not declare react components here.
