import React from 'react';
import { ThemeCompositions } from '@teambit/documenter.theme.theme-compositions';
import { P } from './paragraph';

export const ParagraphExample = () => (
  <ThemeCompositions>
    <P data-testid="test-p">p element</P>
  </ThemeCompositions>
);
