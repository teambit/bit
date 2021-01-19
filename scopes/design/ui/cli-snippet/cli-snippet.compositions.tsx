import React from 'react';
import { ThemeCompositions } from '@teambit/documenter.theme.theme-compositions';

import { CliSnippet } from './index';

const content = `this is some cli content\n which should be rendered properly as html`;

export const CliSnippetExample = () => {
  return (
    <ThemeCompositions>
      <CliSnippet content={content} />
    </ThemeCompositions>
  );
};
