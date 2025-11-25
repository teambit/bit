import React from 'react';
import classNames from 'classnames';
import styles from './styles.module.scss';

type DefaultAvatarProps = {
  size?: number;
} & React.HTMLAttributes<HTMLDivElement>;

export function DefaultAvatar({ size = 32, children, className, ...rest }: DefaultAvatarProps) {
  return (
    <div
      className={classNames(styles.default, styles.avatar, className)}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        fontSize: `${size * 0.35}px`,
        lineHeight: `${size}px`,
      }}
      {...rest}
    >
      ?{children}
    </div>
  );
}
