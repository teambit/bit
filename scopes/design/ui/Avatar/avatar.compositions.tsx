import React from 'react';
import { ThemeCompositions } from '@teambit/documenter.theme.theme-compositions';
import { DefaultAvatar, OrgAvatar, UserAvatar } from './index';

const accounts = {
  defAccount: { name: 'defaultAccount', type: 'default', profileImage: 'https://static.bit.dev/harmony/support.svg' },
  orgAccount: { name: 'defaultAccount', type: 'organization', profileImage: 'https://static.bit.dev/bit-logo.svg' },
  userAccount: {
    displayName: 'display name',
    name: 'defaultAccount',
    type: 'user',
    profileImage: 'https://static.bit.dev/harmony/github.svg',
  },
  noPicOrgAccount: { name: 'defaultAccount', type: 'organization' },
  noPicUserAccount: { name: 'defaultAccount', type: 'user' },
  noNameAccount: { name: '', type: 'user' },
};

export const DefaultAvatarExample = () => (
  <ThemeCompositions>
    <DefaultAvatar size={32} account={accounts.defAccount} />
  </ThemeCompositions>
);

export const OrganizationAvatarExample = () => (
  <ThemeCompositions>
    <OrgAvatar size={32} account={accounts.orgAccount} />
  </ThemeCompositions>
);

export const UserAvatarExample = () => (
  <ThemeCompositions>
    <UserAvatar size={32} account={accounts.userAccount} />
  </ThemeCompositions>
);

export const LargeAvatarExample = () => (
  <ThemeCompositions>
    <OrgAvatar size={100} account={accounts.orgAccount} />
  </ThemeCompositions>
);

export const NoSetIconOrgAvatar = () => (
  <ThemeCompositions>
    <OrgAvatar size={32} account={accounts.noPicOrgAccount} />
  </ThemeCompositions>
);

export const NoSetIconUserAvatar = () => (
  <ThemeCompositions>
    <UserAvatar size={32} account={accounts.noPicUserAccount} />
  </ThemeCompositions>
);

export const NoUserNameAvatarExample = () => (
  <ThemeCompositions>
    <UserAvatar size={32} account={accounts.noNameAccount} />
  </ThemeCompositions>
);

export const UserAvatarWithTooltipExample = () => (
  <ThemeCompositions>
    <UserAvatar size={32} account={accounts.userAccount} showTooltip />
  </ThemeCompositions>
);
