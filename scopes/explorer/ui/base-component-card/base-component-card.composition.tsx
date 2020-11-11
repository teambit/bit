import React from 'react';
import { BaseComponentCard } from './base-component-card';

export const BaseComponentCardExample = () => {
  return (
    <div style={{ width: '300px' }}>
      <BaseComponentCard id="ui/base/component" />
    </div>
  );
};
export const BaseComponentCardExample2 = () => {
  return (
    <BaseComponentCard
      id="ui/concrete/component-card-bla2"
      preview={<div style={{ backgroundColor: 'red' }}>hellow world2</div>}
    />
  );
};

export const MainPreview = () => {
  return <div>main preview</div>;
};
