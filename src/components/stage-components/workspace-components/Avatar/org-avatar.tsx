import React, { PureComponent } from 'react';
import classNames from 'classnames';
import { AccountObj } from './avatar';
// import Tooltip from 'react-tooltip';

import styles from './styles.module.scss';
import { addQueryParams } from './utils';
// import { v1 } from 'uuid';

type Props = {
  account: AccountObj;
  size: number;
  imageSize?: number;
  fontSize?: number;
  className?: string;
  imgClassName?: string;
  // hideTooltip?: boolean;
};

export class OrgAvatar extends PureComponent<Props> {
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
      fontSize = size * 0.35,
      className,
      imgClassName,
      // hideTooltip = false
    } = this.props;
    // const { tooltipId } = this.state;

    const { profileImage = '' /* , name = '', displayName = '' */ } = account;
    const profileImageWithParams = addQueryParams(profileImage, imageSize);

    return (
      <div
        className={classNames(styles.default, styles.avatar, className)}
        style={{ width: `${size}px`, height: `${size}px` }}
        // data-for={tooltipId}
        // data-tip={displayName || name}
      >
        {profileImageWithParams && (
          <img src={profileImageWithParams} className={classNames(styles.avatarImg, imgClassName)} />
        )}
        <span className={styles.defaultAvatar}>
          <i className="bitcon-org" style={{ fontSize: `${fontSize}px`, lineHeight: `${size}px` }} />
        </span>
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
