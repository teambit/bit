import React from 'react';
import ReactDOM from 'react-dom';

import { DocsApp } from './docs-app';

export default function DocsRoot(Provider: React.ComponentType, componentId: string, docs: any, compositions: any) {
  ReactDOM.render(
    <DocsApp Provider={Provider} compositions={compositions} docs={docs} componentId={componentId} />,
    document.getElementById('root')
  );
}

// hot reloading works when components are in a different file.
// do not declare react components here.
