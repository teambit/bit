import React from 'react';
import { UserAvatar } from './user-avatar';
import { OrgAvatar } from './org-avatar';
import { DefaultAvatar } from './default-avatar';

export enum AccountTypes {
  org = 'organization',
  user = 'user',
  default = 'default'
}

export type AccountObj = {
  accountType: AccountTypes; //defined at constant/roles.js
  name: string;
  displayName?: string;
  profileImage?: string;
};

const AvatarByType = {
  [AccountTypes.user]: UserAvatar,
  [AccountTypes.org]: OrgAvatar
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
  // const { accountType } = account;
  if (account.accountType === AccountTypes.user) {
    return <UserAvatar {...props} />;
  }
  if (account.accountType === AccountTypes.org) {
    return <OrgAvatar {...props} />;
  }
  return <DefaultAvatar {...props} />;
  // const SpecificAvatar = AvatarByType[accountType] || DefaultAvatar;

  // return <SpecificAvatar {...props} />;
}
