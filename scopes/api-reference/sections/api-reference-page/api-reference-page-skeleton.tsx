import React from 'react';
import classNames from 'classnames';
import { H1 } from '@teambit/documenter.ui.heading';
import { SplitPane, Pane, Layout } from '@teambit/base-ui.surfaces.split-pane.split-pane';
import { HoverSplitter } from '@teambit/base-ui.surfaces.split-pane.hover-splitter';

import styles from './api-reference-page.module.scss';

export function ApiReferenceSkeleton({ layout, className }: { layout: Layout; className?: string }) {
  return (
    <SplitPane layout={layout} size="85%" className={classNames(styles.apiRefPageContainer, className)}>
      <Pane className={styles.left}>
        <div className={styles.apiReferenceSkeleton}>
          <H1>Api Reference</H1>
          <div className={classNames(styles.block, styles.snippet)} />
          <div className={styles.block} />
        </div>
      </Pane>
      <HoverSplitter className={styles.splitter}></HoverSplitter>
      <Pane className={styles.right}>
        <div className={styles.block} />
      </Pane>
    </SplitPane>
  );
}
