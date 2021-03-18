import React, { PureComponent } from 'react';
import classNames from 'classnames';
import { Icon } from '@teambit/evangelist.elements.icon';
import { addAvatarQueryParams } from '@teambit/url.add-avatar-query-params';
import { getInitials } from '@teambit/string.get-initials';
import { letterBgColors } from '@teambit/ui.styles.colors-by-letter';
import { AccountObj } from './avatar';
import styles from './styles.module.scss';

export type UserAvatarProps = {
  account: AccountObj;
  size: number;
  imageSize?: number;
  fontSize?: number;
  className?: string;
  imgClassName?: string;
};

export class UserAvatar extends PureComponent<UserAvatarProps> {
  render() {
    const { account, size, imageSize = size, fontSize = Math.round(size * 0.4), className, imgClassName } = this.props;
    const { profileImage = '', name = '', displayName = '' } = account;
    const firstLetter = name[0] || displayName[0];
    const profileImageWithParams = addAvatarQueryParams(profileImage, imageSize, styles.defaultAvatarBgColor);
    const colors = firstLetter && letterBgColors[firstLetter.toLowerCase()];
    return (
      <div className={classNames(colors, styles.avatar, className)} style={{ width: `${size}px`, height: `${size}px` }}>
        {profileImageWithParams && (
          <img src={profileImageWithParams} className={classNames(styles.avatarImg, imgClassName)} />
        )}
        {(displayName || name) && (
          <span className={styles.letter} style={{ fontSize: `${fontSize}px`, lineHeight: `${size}px` }}>
            {getInitials(displayName || name)}
          </span>
        )}
        {!displayName && !name && !profileImageWithParams && !firstLetter && (
          <Icon of="solo-avatar" style={{ fontSize: `${size}px` }} className={classNames(styles.avatarImg)} />
        )}
      </div>
    );
  }
}
