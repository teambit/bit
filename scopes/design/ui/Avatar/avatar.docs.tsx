import React from 'react';
import { Section } from '@teambit/documenter.ui.section';
import { ThemeContext } from '@teambit/documenter.theme.theme-context';
import { Separator } from '@teambit/documenter.ui.separator';
import { DefaultAvatar, OrgAvatar, UserAvatar } from './index';

export default function Overview() {
  return (
    <ThemeContext>
      <>
        <Section>
          An avatar component, consisting of 3 different types of Avatar:
          <br />
          <br />
          Default Avatar - no icon, just an '?' and size
          <br />
          Organization Avatar - default org icon (see compositions)
          <br />
          User Icon - icon with initials overlaid
        </Section>
        <Separator />
      </>
    </ThemeContext>
  );
}

Overview.abstract = 'An avatar for all occasions';

Overview.labels = ['react', 'typescript', 'avatar', 'icon'];

const accounts = {
  defAccount: { name: 'defaultAccount', type: 'default', profileImage: 'https://static.bit.dev/harmony/support.svg' },
  orgAccount: { name: 'defaultAccount', type: 'organization', profileImage: 'https://static.bit.dev/bit-logo.svg' },
  userAccount: { name: 'defaultAccount', type: 'user', profileImage: 'https://static.bit.dev/harmony/github.svg' },
};

Overview.examples = [
  {
    scope: {
      DefaultAvatar,
    },
    title: 'Basic org avatar',
    description: 'Show a basic org avatar',
    jsx: <DefaultAvatar size={32} account={accounts.defAccount} />,
  },
  {
    scope: {
      OrgAvatar,
    },
    title: 'Checked Out',
    description: 'Show checked out label beside the version.',
    jsx: <OrgAvatar size={32} account={accounts.orgAccount} />,
  },
  {
    scope: {
      UserAvatar,
    },
    title: 'Checked Out',
    description: 'Show checked out label beside the version.',
    jsx: <UserAvatar size={32} account={accounts.userAccount} />,
  },
];
