import React from 'react';
import { ThemeCompositions } from '@teambit/documenter.theme.theme-compositions';
import { Link } from './link';

export const LinkExample = () => (
  <ThemeCompositions>
    <Link data-testid="test-link" href="https://bit.dev">
      bit.dev
    </Link>
  </ThemeCompositions>
);
