import React from 'react';
import { BaseComponentCard } from './base-component-card';

export const BaseComponentCardExample = () => {
  return (
    <div style={{ width: '300px' }}>
      <BaseComponentCard id="ui/base/component" version="0.0.1" />
    </div>
  );
};

export const BaseComponentCardExample2 = () => {
  return <BaseComponentCard id="ui/concrete/component-card" preview={<div>hello world</div>} />;
};

export const LongTextVerifiedComponent = () => {
  return (
    <div style={{ width: '230px' }}>
      <BaseComponentCard
        id="my-org/my-scope/ui/base/long-long-component-name"
        version="asdasdasdddasdadasdasdasdasdddasdadasd"
        isVerified
      />
    </div>
  );
};

export const NormalTextVerifiedComponent = () => {
  return (
    <div style={{ width: '230px' }}>
      <BaseComponentCard id="ui/base/component-name" version="0.0.1" isVerified />
    </div>
  );
};

export const MainPreview = () => {
  return <div>main preview</div>;
};
