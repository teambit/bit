import React from 'react';
import { HighlightedTextSpan } from './highlighted-text-span';
import { ThemeCompositions } from '@teambit/documenter.theme.theme-compositions';

export const HighlightedTextSpanExample = () => {
  return (
    <ThemeCompositions>
      <HighlightedTextSpan data-testid="test-span">Highlighted Text</HighlightedTextSpan>
    </ThemeCompositions>
  );
};
