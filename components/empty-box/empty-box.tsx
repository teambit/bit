import { Icon } from '@teambit/evangelist.elements.icon';
import React from 'react';

import styles from './empty-box.module.scss';

export type EmptyBoxProps = {
  title: string;
  link: string;
  linkText: string;
};

export function EmptyBox({ title, link, linkText }: EmptyBoxProps) {
  return (
    <div className={styles.emptyCompositions}>
      <div className={styles.emptyCompositionsBox}>
        <div>{title}</div>
        <a href={link} target="_blank" rel="noopener noreferrer">
          {linkText}
          <Icon of="arrow_right" />
        </a>
      </div>
    </div>
  );
}
