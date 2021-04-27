import React, { HTMLAttributes } from 'react';
import { Paragraph } from '@teambit/documenter.ui.paragraph';
import styles from './paragraph.module.scss';

export function P({ children, ...rest }: HTMLAttributes<HTMLElement>) {
  return (
    <Paragraph {...rest} size="md" className={styles.mdxParagraph}>
      {children}
    </Paragraph>
  );
}
