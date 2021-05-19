import React, { PureComponent } from 'react';
import classNames from 'classnames';
import Tooltip, { Place, Type, Effect } from 'react-tooltip';
import { v1 } from 'uuid';
import { Icon } from '@teambit/evangelist.elements.icon';
import { addAvatarQueryParams } from '@teambit/toolbox.url.add-avatar-query-params';
import { getInitials } from '@teambit/toolbox.string.get-initials';
import { letterBgColors } from '@teambit/design.ui.styles.colors-by-letter';
import { ellipsis } from '@teambit/design.ui.styles.ellipsis';
import { AccountObj } from './avatar';
import styles from './styles.module.scss';

type tooltipProps = {
  place: Place;
  type: Type;
  effect: Effect;
};
const tooltipDefaultProps: tooltipProps = {
  place: 'bottom',
  type: 'dark',
  effect: 'solid',
};

export type UserAvatarProps = {
  account: AccountObj;
  size: number;
  imageSize?: number;
  fontSize?: number;
  className?: string;
  imgClassName?: string;
  /**
   * showing or not a tooltip when hover on the avatar, this value is false by default
   */
  showTooltip?: boolean;
} & React.HTMLAttributes<HTMLDivElement>;

export class UserAvatar extends PureComponent<UserAvatarProps> {
  state = {
    tooltipId: '',
    isMobile: false,
  };

  componentDidMount() {
    this.setState({ tooltipId: v1() });
    if (window.innerWidth <= 1080) {
      this.setState({ isMobile: true });
    }
  }

  render() {
    const {
      account,
      size,
      imageSize = size,
      fontSize = Math.round(size * 0.4),
      className,
      imgClassName,
      showTooltip = false,
      ...rest
    } = this.props;
    const { tooltipId, isMobile } = this.state;
    const { profileImage = '', name = '', displayName = '' } = account;
    const firstLetter = name[0] || displayName[0];
    const profileImageWithParams = addAvatarQueryParams(profileImage, imageSize, styles.defaultAvatarBgColor);
    const colors = firstLetter && letterBgColors[firstLetter.toLowerCase()];
    const isTooltipOn = showTooltip && !!tooltipId && !isMobile;
    return (
      <div
        className={classNames(colors, styles.avatar, className)}
        style={{ width: `${size}px`, height: `${size}px` }}
        data-for={tooltipId}
        data-tip={displayName || name}
        {...rest}
      >
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
        {isTooltipOn && (
          <Tooltip className={classNames(styles.tooltip, ellipsis)} id={tooltipId} {...tooltipDefaultProps} />
        )}
      </div>
    );
  }
}
