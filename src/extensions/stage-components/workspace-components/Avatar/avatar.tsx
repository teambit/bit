import React from 'react';
import { UserAvatar } from './user-avatar';
import { OrgAvatar } from './org-avatar';
import { DefaultAvatar } from './default-avatar';

export enum AccountTypes {
  org = 'organization',
  user = 'user',
  default = 'default',
}

export type AccountObj = {
  accountType: AccountTypes;
  name: string;
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
  hideTooltip?: boolean;
};

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
