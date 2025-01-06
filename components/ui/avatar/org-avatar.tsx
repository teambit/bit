import React from 'react';
import classNames from 'classnames';
import { addAvatarQueryParams } from '@teambit/toolbox.url.add-avatar-query-params';
import { AccountObj } from './avatar';
import styles from './styles.module.scss';

export type OrgAvatarProps = {
  account: AccountObj;
  size?: number;
  imageSize?: number;
  fontSize?: number;
  imgClassName?: string;
} & React.HTMLAttributes<HTMLDivElement>;

export function OrgAvatar({
  account,
  size = 32,
  imageSize = size,
  fontSize = Math.round(size * 0.4),
  className,
  imgClassName,
  children,
  ...rest
}: OrgAvatarProps) {
  const { profileImage = '' } = account;
  const profileImageWithParams =
    profileImage && profileImage.startsWith('blob:')
      ? profileImage
      : addAvatarQueryParams(profileImage, imageSize, styles.defaultAvatarBgColor);

  return (
    <div
      className={classNames(styles.default, styles.avatar, className)}
      style={{ minWidth: `${size}px`, width: `${size}px`, height: `${size}px` }}
      {...rest}
    >
      {profileImageWithParams && (
        <img
          src={profileImageWithParams}
          className={classNames(styles.avatarImg, profileImage.startsWith('blob:') && styles.blob, imgClassName)}
        />
      )}
      <span className={styles.defaultAvatar}>
        <i className="bitcon-organization" style={{ fontSize: `${fontSize}px`, lineHeight: `${size}px` }} />
      </span>
      {children}
    </div>
  );
}
