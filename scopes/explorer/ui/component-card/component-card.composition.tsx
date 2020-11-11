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
    <ComponentCard
      id="ui/concrete/component-card-bla2"
      preview={<div style={{ backgroundColor: 'red' }}>hellow world2</div>}
    />
  );
};
