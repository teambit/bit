import React from 'react';
import { CopyBox } from './copy-box';

export function WithText() {
  return <CopyBox style={{ width: 300, lineHeight: '46px' }}>some text to copy</CopyBox>;
}
