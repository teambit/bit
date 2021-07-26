import React from 'react';
import { ScopeTitle } from './scope-title';

export const ScopeTitleExample = () => <ScopeTitle scopeName="teambit.base-ui" />;

export const ScopeTitleWithSingleWordExample = () => <ScopeTitle scopeName="base-ui" />;

export const ScopeTitleWithImageExample = () => (
  <ScopeTitle
    scopeName="teambit.base-ui"
    icon="https://bitsrc.imgix.net/8906f31bf4ae987413d3fdc1171be928f6b16e59.png"
  />
);

export const ScopeTitleWithIconExample = () => (
  <ScopeTitle scopeName="teambit.base-ui" icon="https://static.bit.dev/scope-icons-selector/Spaceship.svg?v=0.2" />
);
