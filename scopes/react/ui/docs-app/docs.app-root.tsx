import { RenderingContext } from '@teambit/preview';
import React from 'react';
import ReactDOM from 'react-dom';

import { DocsApp } from './docs-app';
import type { DocsFile } from './examples-overview/example';

/**
 * These are the parameters supplied to all docs apps by the bit UI runtime
 */
export type ReactDocsRoot = (
  Provider: React.ComponentType | undefined,
  componentId: string,
  docs: DocsFile | undefined,
  compositions: any,
  context: RenderingContext
) => void;


const DocsRoot: ReactDocsRoot = function(
  Provider,
  componentId,
  docs,
  compositions,
  context
) {
  ReactDOM.render(
    <DocsApp
      componentId={componentId}
      docs={docs}
      compositions={compositions}
      context={context}
    />
    ,
    document.getElementById('root')
  );
}

export default DocsRoot;

// hot reloading works when components are in a different file.
// do not declare react components here.
