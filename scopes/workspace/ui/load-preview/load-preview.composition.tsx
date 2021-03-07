import React from 'react';
import { ThemeCompositions } from '@teambit/documenter.theme.theme-compositions';
import { LoadPreview } from './load-preview';

export const LoadPreviewExample = ({ ...rest }) => (
  <ThemeCompositions style={{ position: 'relative', width: 200, height: 50 }}>
    <LoadPreview {...rest} />
  </ThemeCompositions>
);
