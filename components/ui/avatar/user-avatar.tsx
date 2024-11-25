import React from 'react';
import classNames from 'classnames';
import { Icon } from '@teambit/design.elements.icon';
import { addAvatarQueryParams } from '@teambit/toolbox.url.add-avatar-query-params';
import { getInitials } from '@teambit/toolbox.string.get-initials';
import { letterBgColors } from '@teambit/design.ui.styles.colors-by-letter';
import { ellipsis } from '@teambit/design.ui.styles.ellipsis';
import { Tooltip } from '@teambit/design.ui.tooltip';
import type { Placement as TooltipPlacement } from '@teambit/design.ui.tooltip';
import { AccountObj } from './avatar';
import styles from './styles.module.scss';

export type UserAvatarProps = {
  account: AccountObj;
  size: number;
  imageSize?: number;
  fontSize?: number;
  imgClassName?: string;
  /**
   * showing or not a tooltip when hover on the avatar, this value is false by default
   */
  showTooltip?: boolean;
  tooltipPlacement?: TooltipPlacement;
} & React.HTMLAttributes<HTMLDivElement>;

export function UserAvatar({
  account,
  size,
  imageSize = size,
  fontSize = Math.round(size * 0.4),
  className,
  imgClassName,
  showTooltip = false,
  tooltipPlacement = 'bottom',
  children,
  ...rest
}: UserAvatarProps) {
  const { profileImage = '', name = '', displayName = '' } = account;
  const firstLetter = name[0] || displayName[0];
  const profileImageWithParams =
    profileImage && profileImage.startsWith('blob:')
      ? profileImage
      : addAvatarQueryParams(profileImage, imageSize, styles.defaultAvatarBgColor);
  const colors = firstLetter && letterBgColors[firstLetter.toLowerCase()];
  const avatar = (
    <div
      className={classNames(colors, styles.avatar, className)}
      style={{ minWidth: `${size}px`, width: `${size}px`, height: `${size}px` }}
      {...rest}
    >
      {profileImageWithParams && (
        <img
          src={profileImageWithParams}
          className={classNames(styles.avatarImg, profileImage.startsWith('blob:') && styles.blob, imgClassName)}
        />
      )}
      {(displayName || name) && (
        <span className={styles.letter} style={{ fontSize: `${fontSize}px`, lineHeight: `${size}px` }}>
          {getInitials(displayName || name)}
        </span>
      )}
      {!displayName && !name && !profileImageWithParams && !firstLetter && (
        <Icon
          of="solo-avatar"
          style={{ fontSize: `${size}px` }}
          className={classNames(styles.avatarImg, styles.soloAvatarIcon)}
        />
      )}
      {children}
    </div>
  );

  return showTooltip ? (
    <Tooltip
      placement={tooltipPlacement}
      content={
        <div className={ellipsis}>
          {displayName ? (
            <>
              {displayName} (@{name})
            </>
          ) : (
            <>@{name}</>
          )}
        </div>
      }
    >
      {avatar}
    </Tooltip>
  ) : (
    avatar
  );
}
