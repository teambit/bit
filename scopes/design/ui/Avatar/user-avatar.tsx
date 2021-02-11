import { Icon } from '@teambit/evangelist.elements.icon';
import classNames from 'classnames';
import React, { PureComponent } from 'react';

import { AccountObj } from './avatar';
import avatarColors from './avatar-colors.module.scss';
import styles from './styles.module.scss';
import { addQueryParams, getInitials } from './utils';

type UserAvatarProps = {
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
    const profileImageWithParams = addQueryParams(profileImage, imageSize);
    const colors = avatarColors[firstLetter.toLowerCase()];
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
        {!displayName && !name && !profileImageWithParams && (
          <Icon of="solo-avatar" style={{ fontSize: `${size}px` }} className={classNames(styles.avatarImg)} />
        )}
      </div>
    );
  }
}
