import React from 'react';

import { DefaultAvatar } from './default-avatar';
import { OrgAvatar } from './org-avatar';
import { UserAvatar } from './user-avatar';

export enum AccountTypes {
  org = 'organization',
  user = 'user',
  default = 'default',
}

export type AccountObj = {
  accountType?: AccountTypes;
  name?: string;
  displayName?: string;
  profileImage?: string;
};

type AvatarProps = {
  account: AccountObj;
  size: number;
  imageSize?: number;
  fontSize?: number;
  className?: string;
  imgClassName?: string;
  showTooltip?: boolean;
} & React.HTMLAttributes<HTMLDivElement>;

export default function Avatar(props: AvatarProps) {
  const { account } = props;

  switch (account.accountType) {
    case AccountTypes.user:
      return <UserAvatar {...props} />;
    case AccountTypes.org:
      return <OrgAvatar {...props} />;
    default:
      return <DefaultAvatar {...props} />;
  }
}
