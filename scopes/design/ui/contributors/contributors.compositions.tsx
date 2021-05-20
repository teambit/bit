import React from 'react';
import { ThemeCompositions } from '@teambit/documenter.theme.theme-compositions';
import { AccountTypes } from '@teambit/design.ui.avatar';

import { Contributors } from './index';

const mockContributors = [
  {
    name: 'Should Not Appear',
    accountType: AccountTypes.user,
    displayName: 'shouldDisplayThis',
    profileImage: 'https://static.bit.dev/harmony/support.svg',
  },
  {
    name: 'Mark Mock No DisplayName',
    accountType: AccountTypes.user,
    profileImage: 'https://static.bit.dev/harmony/github.svg',
  },
  {
    name: "Three's a crowd",
    accountType: AccountTypes.user,
  },
];

export const SingleContributorExample = () => {
  return (
    <ThemeCompositions>
      <Contributors contributors={[mockContributors[0]]} timestamp={Date().toString()} />
    </ThemeCompositions>
  );
};

export const DoubleContributorExample = () => {
  return (
    <ThemeCompositions>
      <Contributors contributors={[mockContributors[0], mockContributors[1]]} timestamp={Date().toString()} />
    </ThemeCompositions>
  );
};

export const TripleContributorExample = () => {
  return (
    <ThemeCompositions>
      <Contributors contributors={mockContributors} timestamp={Date().toString()} />
    </ThemeCompositions>
  );
};
