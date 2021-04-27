import React from 'react';
import { ThemeContext } from '@teambit/documenter.theme.theme-context';
import { ServerErrorPage } from './server-error-page';

export const ServerErrorPageExample = () => {
  return (
    <ThemeContext>
      <ServerErrorPage />
    </ThemeContext>
  );
};
