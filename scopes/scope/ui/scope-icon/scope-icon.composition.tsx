import React from 'react';
import { ScopeIcon } from './scope-icon';

const imageLink = 'https://bitsrc.imgix.net/8906f31bf4ae987413d3fdc1171be928f6b16e59.png';

export const DefaultTextExample = (props: any) => {
  const name = 'scope name test';
  return (
    <div>
      <div>name: {name}</div>
      <ScopeIcon displayName={name} {...props} />
    </div>
  );
};

export const OneWordTextExample = () => {
  const name = 'scope';
  return (
    <div>
      <div>name: {name}</div>
      <ScopeIcon displayName={name} />
    </div>
  );
};

export const EmptyTextExample = () => {
  const name = '';
  return (
    <div>
      <div>name: {name}</div>
      <ScopeIcon displayName={name} />
    </div>
  );
};

export const TextWithBackgroundColorExample = () => {
  const name = 'scope';
  return <ScopeIcon displayName={name} bgColor="black" />;
};

export const ScopeImageExample = () => {
  return <ScopeIcon scopeImage={imageLink} />;
};

export const ScopeImageWithBackgroundColorExample = () => {
  return <ScopeIcon scopeImage={imageLink} bgColor="black" />;
};

export const ScopeImageWithIconAndBackgroundExample = () => {
  return (
    <ScopeIcon
      displayName="myscope"
      scopeImage="https://static.bit.dev/scope-icons-selector/Spaceship.svg?v=0.2"
      bgColor="black"
    />
  );
};
