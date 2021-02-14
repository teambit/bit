import React from 'react';
import classNames from 'classnames';
import { BaseImage, BaseImageProps } from '@teambit/base-ui.elements.image';
import styles from './avatar.module.scss';

export type AvatarProps = {
  /**
   * image url
   */
  src: string;
  /**
   * alt text (to comply a11y standards)
   */
  alt: string;
} & BaseImageProps;

export const Avatar = ({ src, alt, className, ...rest }: AvatarProps) => (
  <BaseImage alt={alt} className={classNames(styles.avatar, className)} src={src} {...rest} />
);
