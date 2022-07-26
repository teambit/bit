import { DocsRootProps } from '@teambit/docs';
import React from 'react';
import ReactDOM from 'react-dom';

import { DocsApp } from './docs-app';

function DocsRoot({ componentId, docs, compositions, context }: DocsRootProps) {
  ReactDOM.render(
    <DocsApp componentId={componentId} docs={docs} compositions={compositions} context={context} />,
    document.getElementById('root')
  );
}

// For backward compatibility - can be removed end of 2022
DocsRoot.apiObject = true;

export default DocsRoot;

// hot reloading works when components are in a different file.
// do not declare react components here.
