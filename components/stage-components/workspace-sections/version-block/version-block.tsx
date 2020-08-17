import React, { HTMLAttributes } from 'react';
import classNames from 'classnames';
import { H3 } from '@teambit/documenter-temp.ui.heading';
import { Author, Snap } from '@teambit/component/snap';
import { NavLink } from '@teambit/react-router/nav-link';
import { StatusDot } from '@teambit/staged-components.side-bar/component-tree/status-dot/status-dot';
import { Contributors } from '@teambit/staged-components.workspace-sections.contributors/contributors';
import { Labels } from '@teambit/staged-components.workspace-sections.version-label';
import styles from './version-block.module.scss';

export type VersionBlockProps = {
  version: string;
  hash: string;
  timestamp: string;
  parents: Snap[];
  author?: Author;
  message: string;
  isLatest: boolean;
} & HTMLAttributes<HTMLDivElement>;
/**
 * change log section
 * @name VersionBlock
 */
export function VersionBlock({ version, isLatest, className, timestamp, author, message, ...rest }: VersionBlockProps) {
  return (
    <div className={styles.versionWrapper}>
      <div className={styles.left}>
        <Labels isLatest={isLatest} isCurrent={false} />
        <NavLink className={styles.link} href="~tests">
          Tests
          <StatusDot status="new" />
        </NavLink>
        <NavLink className={styles.link} href="~compositions">
          Compositions
        </NavLink>
      </div>
      <div className={classNames(styles.right, className)} {...rest}>
        <H3 className={styles.versionTitle}>v{version}</H3>
        <Contributors contributors={[author || {}]} timestamp={timestamp} />
        {commitMessage(message)}
      </div>
    </div>
  );
}

function commitMessage(message: string) {
  if (!message || message === '') return <div className={styles.emptyMessage}>No commit message</div>;
  return <div className={styles.commitMessage}>{message}</div>;
}
