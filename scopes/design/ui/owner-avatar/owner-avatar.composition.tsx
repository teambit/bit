import React from 'react';
import { ThemeCompositions } from '@teambit/documenter.theme.theme-compositions';
import { OwnerAvatar } from './owner-avatar';

const userAccount = { name: 'defaultAccount', type: 'user', profileImage: 'https://static.bit.dev/harmony/github.svg' };

export const OwnerAvatarExample = () => (
  <ThemeCompositions>
    <OwnerAvatar size={32} account={userAccount} />
  </ThemeCompositions>
);

export const OwnerAvatarWithoutImageExample = () => (
  <ThemeCompositions>
    <OwnerAvatar size={32} account={{ ...userAccount, name: '', profileImage: '' }} />
  </ThemeCompositions>
);
