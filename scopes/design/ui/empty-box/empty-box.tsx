import { Icon } from '@teambit/evangelist.elements.icon';
import React from 'react';
import classNames from 'classnames';
import styles from './empty-box.module.scss';

export type EmptyBoxProps = {
  title: string;
  link: string;
  linkText: string;
} & React.HTMLAttributes<HTMLDivElement>;

export function EmptyBox({ title, link, linkText, className, ...rest }: EmptyBoxProps) {
  return (
    <div {...rest} className={classNames(styles.emptyCompositions, className)}>
      <div className={styles.innerBorder}>
        <div>{title}</div>
        <a href={link} target="_blank" rel="noopener noreferrer">
          {linkText}
          <Icon of="arrow_right" />
        </a>
      </div>
    </div>
  );
}
