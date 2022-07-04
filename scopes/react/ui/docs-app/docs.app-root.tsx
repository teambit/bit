import { RenderingContext } from '@teambit/preview';
import React from 'react';
import ReactDOM from 'react-dom';

import { DocsApp } from './docs-app';
import type { DocsFile } from './examples-overview/example';

export type ReactDocsRootParams = [
  /* Provider: */ React.ComponentType | undefined,
  /* componentId: */ string,
  /* docs: */ DocsFile | undefined,
  /* compositions: */ Record<string, any>,
  /* context: */ RenderingContext
];

export default function DocsRoot(
  /**
   * @deprecated
   */
  Provider: React.ComponentType | undefined,
  componentId: string,
  docs: DocsFile | undefined,
  compositions: any,
  context: RenderingContext
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

// hot reloading works when components are in a different file.
// do not declare react components here.
