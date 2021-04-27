import React from 'react';
import { ThemeCompositions } from '@teambit/documenter.theme.theme-compositions';
import { HighlightedTextSpan } from './highlighted-text-span';

export const HighlightedTextSpanExample = () => {
  return (
    <ThemeCompositions>
      <HighlightedTextSpan data-testid="test-span">Highlighted Text</HighlightedTextSpan>
    </ThemeCompositions>
  );
};
