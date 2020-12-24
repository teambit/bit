import React from 'react';
import { DefaultAvatar, OrgAvatar, UserAvatar } from './index';

const accounts = {
  defAccount: { name: 'defaultAccount', type: 'default', profileImage: 'https://static.bit.dev/harmony/support.svg' },
  orgAccount: { name: 'defaultAccount', type: 'organization', profileImage: 'https://static.bit.dev/bit-logo.svg' },
  userAccount: { name: 'defaultAccount', type: 'user', profileImage: 'https://static.bit.dev/harmony/github.svg' },
  noPicOrgAccount: { name: 'defaultAccount', type: 'organization' },
  noPicUserAccount: { name: 'defaultAccount', type: 'user' },
};

export const DefaultAvatarExample = () => <DefaultAvatar size={32} account={accounts.defAccount} />;

export const OrganizationAvatarExample = () => <OrgAvatar size={32} account={accounts.orgAccount} />;

export const UserAvatarExample = () => <UserAvatar size={32} account={accounts.userAccount} />;

export const LargeAvatarExample = () => <OrgAvatar size={100} account={accounts.orgAccount} />;

export const NoSetIconOrgAvatar = () => <OrgAvatar size={32} account={accounts.noPicOrgAccount} />;

export const NoSetIconUserAvatar = () => <UserAvatar size={32} account={accounts.noPicUserAccount} />;
