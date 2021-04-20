import React from 'react';
import { ComponentCard } from './component-card';

export const ComponentCardExample = () => {
  return (
    <div style={{ width: '300px' }}>
      <ComponentCard id="ui/base/component" />
    </div>
  );
};
export const ComponentCardExample2 = () => {
  return (
    <div style={{ width: '300px' }}>
      <ComponentCard id="ui/concrete/component-card" preview={<div>hello world</div>} />
    </div>
  );
};
