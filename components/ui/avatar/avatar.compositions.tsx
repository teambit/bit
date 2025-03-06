import React from 'react';
import { AccountDescriptor } from '@teambit/accounts.account-descriptor';
import { DefaultAvatar, OrgAvatar, UserAvatar, Avatar } from './index';

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

export const BasicAvatarExample = () => (
  <div
    style={{
      width: '100%',
      display: 'flex',
      justifyContent: 'center',
      gap: 16,
      margin: '12px auto',
    }}
  >
    <Avatar />
    <Avatar
      account={AccountDescriptor.fromObject({
        id: '',
        image:
          'https://bitsrc.imgix.net/dfed500a7cfd20263860c20f4e786e2ff7e7645c.jpeg?size=32&w=64&h=64&crop=faces&fit=crop&bg=ededed',
        name: 'joshk2',
        displayName: 'Josh Kuttler',
        type: 'user',
        entity: '{}',
      })}
    />
    <Avatar
      account={AccountDescriptor.fromObject({
        id: '',
        image: 'https://bitsrc.imgix.net/102fee41d005d76010a8b16f466b13cc75d870d6.png?h=192',
        name: 'teambit',
        displayName: 'teambit',
        type: 'org',
        entity: '{}',
      })}
    />
  </div>
);

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

export const UserAvatarWithTopTooltipExample = () => (
  <div style={{ display: 'flex', justifyContent: 'center', marginTop: 70 }}>
    <UserAvatar size={32} account={accounts.userAccount} showTooltip tooltipPlacement="top" />
  </div>
);
