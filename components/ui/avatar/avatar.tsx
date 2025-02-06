import React from 'react';
import { AccountDescriptor } from '@teambit/accounts.account-descriptor';
import type { Placement as TooltipPlacement } from '@teambit/design.ui.tooltip';
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
  account?: AccountDescriptor;
  size?: number;
  imageSize?: number;
  fontSize?: number;
  className?: string;
  imgClassName?: string;
  showTooltip?: boolean;
  tooltipPlacement?: TooltipPlacement;
} & React.HTMLAttributes<HTMLDivElement>;

export function Avatar({ account, ...rest }: AvatarProps) {
  if (!account) return <DefaultAvatar {...rest} />;
  const { type, name, displayName, image } = account;
  const accountObj: AccountObj = {
    name,
    displayName,
    profileImage: image,
  };

  if (type === 'user') return <UserAvatar account={accountObj} {...rest} />;
  if (type === 'org') return <OrgAvatar account={accountObj} {...rest} />;
  return <DefaultAvatar {...rest} />;
}
