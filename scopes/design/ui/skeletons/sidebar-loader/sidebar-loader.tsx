import React from 'react';
import classNames from 'classnames';
import { WordSkeleton } from '@teambit/base-ui.loaders.skeleton';

import styles from './sidebar-loader.module.scss';

export type SidebarLoaderProps = {} & React.HTMLAttributes<HTMLDivElement>;

export function SidebarLoader({ className, ...rest }: SidebarLoaderProps) {
  return (
    <div {...rest} className={classNames(styles.sidebar, className)}>
      <div className={styles.overview}>
        <OverviewLink />
        <OverviewLink />
      </div>
      <ComponentTreeLoader />
    </div>
  );
}

function OverviewLink() {
  return (
    <div className={styles.link}>
      <WordSkeleton length={3} />
      <WordSkeleton length={7} />
    </div>
  );
}

export function ComponentTreeLoader() {
  return (
    <div className={styles.componentList}>
      <WordSkeleton length={10} />
      <WordSkeleton length={6} />
      <WordSkeleton length={8} />
      <WordSkeleton length={12} />
      <WordSkeleton length={6} />
      <WordSkeleton length={7} />
      <WordSkeleton length={9} />
      <WordSkeleton length={3} />
      <WordSkeleton length={8} />
      <WordSkeleton length={15} />
      <WordSkeleton length={5} />
      <WordSkeleton length={9} />
    </div>
  );
}
