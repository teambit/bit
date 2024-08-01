import React from 'react';
import { DefaultAvatar, OrgAvatar, UserAvatar } from './index';

const accounts = {
  defAccount: {
    name: 'defaultAccount',
    type: 'default',
    profileImage: 'https://static.bit.dev/harmony/support.svg',
  },
  orgAccount: {
    name: 'defaultAccount',
    type: 'organization',
    profileImage: 'https://static.bit.dev/bit-logo.svg',
  },
  userAccount: {
    displayName: 'Josh Kuttler',
    name: 'joshk2',
    type: 'user',
    profileImage: 'https://static.bit.dev/harmony/github.svg',
  },
  noPicOrgAccount: { name: 'defaultAccount', type: 'organization' },
  noPicUserAccount: { name: 'defaultAccount', type: 'user' },
  noNameAccount: { name: '', type: 'user' },
};

export const DefaultAvatarExample = () => <DefaultAvatar />;

export const OrganizationAvatarExample = () => <OrgAvatar size={32} account={accounts.orgAccount} />;

export const UserAvatarExample = () => <UserAvatar size={32} account={accounts.userAccount} />;

export const LargeAvatarExample = () => <OrgAvatar size={100} account={accounts.orgAccount} />;

export const NoSetIconOrgAvatar = () => <OrgAvatar size={32} account={accounts.noPicOrgAccount} />;

export const NoSetIconUserAvatar = () => <UserAvatar size={32} account={accounts.noPicUserAccount} />;

export const NoUserNameAvatarExample = () => <UserAvatar size={32} account={accounts.noNameAccount} />;

export const UserAvatarWithTooltipExample = () => (
  <div style={{ display: 'flex', justifyContent: 'center' }}>
    <UserAvatar size={32} account={accounts.userAccount} showTooltip />
  </div>
);
