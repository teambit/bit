import React from 'react';
import classNames from 'classnames';
import { textSize } from '@teambit/base-ui.text.text-sizes';
import { getInitials } from '@teambit/toolbox.string.get-initials';
import { addAvatarQueryParams } from '@teambit/toolbox.url.add-avatar-query-params';
import styles from './scope-icon.module.scss';

export type ScopeIconProps = {
  /**
   * the name of the scope
   */
  displayName?: string;
  /**
   * the image url of the scope that the user can upload in the scope settings, or choose from a selection of icons in the scope settings.
   */
  scopeImage?: string;
  /**
   * option to pass styling for the image/icon only
   */
  imgClassName?: string;
  /**
   * an optional background color
   */
  bgColor?: string;
  /**
   * the size of the width, height and font
   */
  size?: number;
} & React.HTMLAttributes<HTMLDivElement>;

export function ScopeIcon({
  displayName,
  scopeImage,
  bgColor,
  size = 48,
  imgClassName,
  className,
  ...rest
}: ScopeIconProps) {
  const imageWithParams = addAvatarQueryParams(scopeImage || '', size, '');
  return (
    <div
      className={classNames(styles.scopeIcon, scopeImage && styles.iconBackground, className)}
      style={{ backgroundColor: bgColor, fontSize: size }}
      {...rest}
    >
      {imageWithParams ? (
        <img src={imageWithParams} className={classNames(styles.scopeImg, imgClassName)} />
      ) : (
        <span className={classNames(styles.letter, textSize.xs)}>
          {displayName ? getInitials(displayName)?.toUpperCase() : '?'}
        </span>
      )}
    </div>
  );
}
