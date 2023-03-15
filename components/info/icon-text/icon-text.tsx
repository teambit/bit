import React, { ReactElement } from 'react';
import classNames from 'classnames';
import { Link } from '@teambit/design.ui.navigation.link';
import { Text } from '@teambit/design.typography.text';
import styles from './icon-text.module.scss';

export type IconTextProps = {
  /**
   * An optional Icon element to be render at the end of the input, can be an Image or an Icon.
   */
  icon?: ReactElement;
  /**
   * A URL that will be rendered using Link from base-react.
   */
  link?: string;
} & React.HTMLAttributes<HTMLDivElement>;

export function IconText({ icon, link, children, className }: IconTextProps) {
  return (
    <div className={classNames(styles.iconText, icon && styles.withIcon, className)}>
      {icon}
      {link ? (
        <Link href={link} external={link.startsWith('http')}>
          {children || link}
        </Link>
      ) : (
        <Text className={styles.text}>{children}</Text>
      )}
    </div>
  );
}
