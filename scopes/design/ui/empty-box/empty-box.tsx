import React from 'react';
import classNames from 'classnames';
import { MDXLayout } from '@teambit/ui.mdx-layout';
import styles from './empty-box.module.scss';

export type EmptyBoxProps = {} & React.HTMLAttributes<HTMLDivElement>;

export function EmptyBox({ children, className, ...rest }: EmptyBoxProps) {
  return (
    <div {...rest} className={classNames(styles.emptyCompositions, className)}>
      <MDXLayout>{children}</MDXLayout>
    </div>
  );
}
