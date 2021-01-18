import React from 'react';
import { ThemeCompositions } from '@teambit/documenter.theme.theme-compositions';
import { Ellipsis } from './index';

const longName = "This is a really long name so you'll see the ellipsis";
const shortName = 'Short';

export const LongString = () => {
  return (
    <ThemeCompositions>
      <Ellipsis style={{ width: 100 }}>{longName}</Ellipsis>
    </ThemeCompositions>
  );
};

export const ShortString = () => {
  return (
    <ThemeCompositions>
      <Ellipsis style={{ width: 100 }}>{shortName}</Ellipsis>
    </ThemeCompositions>
  );
};
