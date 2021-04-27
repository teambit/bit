import React from 'react';
import { ThemeCompositions } from '@teambit/documenter.theme.theme-compositions';
import { ExternalLink } from './external-link';

export const ExternalLinkExample = () => (
  <ThemeCompositions>
    <ExternalLink href="https://bit.dev">some link text - take me to bit.dev!!</ExternalLink>
  </ThemeCompositions>
);
