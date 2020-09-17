import React from 'react';
import ReactDOM from 'react-dom';

import { DocsApp } from './docs-app';
import { provider, BitBaseEvent } from './pubsub';

export default function DocsRoot(Provider: React.ComponentType, componentId: string, docs: any, compositions: any) {
  const pubsub = provider();
  const sendToPubsub = (e) => {
    const event: BitBaseEvent = {
      type: 'onclick-in-doc-iframe',
      version: '0.0.1',
      timestamp: Date.now().toString(),
      body: e,
    };

    console.log('20000', e);
    pubsub.pub('teambit.bit/react', event);
  };

  ReactDOM.render(
    <DocsApp
      onclick={sendToPubsub}
      Provider={Provider}
      compositions={compositions}
      docs={docs}
      componentId={componentId}
    />,
    document.getElementById('root')
  );
}

// hot reloading works when components are in a different file.
// do not declare react components here.
