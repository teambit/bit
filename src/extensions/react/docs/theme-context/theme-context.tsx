import React from 'react';
import { Theme } from '@bit/bit.base-ui.theme.theme-provider';

type ThemeContextProps = {
  children: JSX.Element;
};

export function ThemeContext({ children }: ThemeContextProps) {
  return (
    <Theme>
      {/* // dev link for icons */}
      <link rel="stylesheet" href="https://i.icomoon.io/public/9dc81da9ad/Bit/style.css"></link>
      {children}
    </Theme>
  );
}
