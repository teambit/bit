import React from 'react';
import { CopyBox } from './copy-box';

export const WideCopyBoxExample = () => {
  return <CopyBox style={{ maxWidth: '600px' }}>npm install @bit.bit.test-scope.copy-box</CopyBox>;
};

export const NarrowCopyBoxExample = () => {
  return <CopyBox style={{ maxWidth: '200px' }}>npm install @bit.bit.test-scope.copy-box2</CopyBox>;
};
