import React from 'react';
import { ComponentCard } from './component-card';

export const ComponentCardExample = () => {
  return (
    <div style={{ width: '300px' }}>
      <ComponentCard id="ui/base/component" />
    </div>
  );
};

export const ComponentCardWithPreview = () => {
  return (
    <div style={{ width: '300px' }}>
      <ComponentCard id="ui/concrete/component-card" preview={<div>hello world</div>} />
    </div>
  );
};

export const ComponentCardWithExternalLink = () => {
  return (
    <div style={{ width: '300px' }}>
      <ComponentCard
        id="teambit/explorer/ui/gallery/component-card"
        preview={<div>external link example</div>}
        href="https://bit.dev/teambit/explorer/ui/gallery/component-card"
      />
    </div>
  );
};
