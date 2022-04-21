import React from 'react';
import { ComponentDeprecated } from './component-deprecated';

export const ComponentDeprecatedExample = () => {
  const deprecation = {
    isDeprecate: true,
  };
  return <ComponentDeprecated deprecation={deprecation} />;
};
