import React from 'react';
import { AccountTypes } from '@teambit/ui.avatar';

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
  return <Contributors contributors={[mockContributors[0]]} timestamp={Date().toString()} />;
};

export const DoubleContributorExample = () => {
  return <Contributors contributors={[mockContributors[0], mockContributors[1]]} timestamp={Date().toString()} />;
};

export const TripleContributorExample = () => {
  return <Contributors contributors={mockContributors} timestamp={Date().toString()} />;
};
