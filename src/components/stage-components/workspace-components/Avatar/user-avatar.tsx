// import { AccountObj } from '../../types/account';

import React, { PureComponent } from 'react';
import classNames from 'classnames';
import { Icon } from '@teambit/evangelist-temp.elements.icon';
import { AccountObj } from './avatar';
// import Tooltip from 'components/Tooltip';
import { addQueryParams, getInitials } from './utils';
import avatarColors from './avatar-colors.module.scss';
import styles from './styles.module.scss';
// import { v1 } from 'uuid';

type UserAvatarProps = {
  account: AccountObj;
  size: number;
  imageSize?: number;
  fontSize?: number;
  className?: string;
  imgClassName?: string;
  // hideTooltip?: boolean;
};

export class UserAvatar extends PureComponent<UserAvatarProps> {
  // state = {
  //   tooltipId: null
  // };
  // componentDidMount() {
  // 	//mount only happens in client side
  // 	//setting state here will prevent id reallocated after serverside rendering
  // 	//prevent double render when id change in clinet side after serverside rendering
  // 	this.setState({ tooltipId: v1() });
  // }

  render() {
    const {
      account,
      size,
      imageSize = size,
      fontSize = Math.round(size * 0.4),
      className,
      imgClassName,
      // hideTooltip = false
    } = this.props;
    // const { tooltipId } = this.state;

    const { profileImage = '', name = '', displayName = '' } = account;
    const firstLetter = name[0];
    const profileImageWithParams = addQueryParams(profileImage, imageSize);
    // if(!account) return
    return (
      <div
        className={classNames(avatarColors[firstLetter], styles.avatar, className)}
        style={{ width: `${size}px`, height: `${size}px` }}
        // data-for={tooltipId}
        // data-tip={displayName || name}
      >
        {profileImageWithParams && (
          <img src={profileImageWithParams} className={classNames(styles.avatarImg, imgClassName)} />
        )}
        {displayName ||
          (name && (
            <span className={styles.letter} style={{ fontSize: `${fontSize}px`, lineHeight: `${size}px` }}>
              {getInitials(displayName || name)}
            </span>
          ))}
        {!displayName && !name && (
          <Icon of="solo-avatar" style={{ fontSize: `${size}px` }} className={classNames(styles.avatarImg)} />
        )}
        {/* {tooltipId && (
					<Tooltip
						className={styles.tooltip}
						id={tooltipId}
						place="bottom"
						type="dark"
						effect="solid"
						disable={hideTooltip}
					/>
				)} */}
      </div>
    );
  }
}
