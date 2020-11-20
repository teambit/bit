import { Author, Snap } from '@teambit/component';
import { H3 } from '@teambit/documenter.ui.heading';
import { Contributors } from '@teambit/ui.contributors';
import { NavLink } from '@teambit/ui.react-router.nav-link';
import { Labels } from '@teambit/ui.version-label';
import classNames from 'classnames';
import React, { HTMLAttributes } from 'react';

import styles from './version-block.module.scss';

export type VersionBlockProps = {
  componentId: string;
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
export function VersionBlock({
  version,
  isLatest,
  className,
  timestamp,
  author,
  message,
  componentId,
  ...rest
}: VersionBlockProps) {
  return (
    <div className={styles.versionWrapper}>
      <div className={styles.left}>
        <Labels isLatest={isLatest} isCurrent={false} />
        <NavLink className={styles.link} href={`~tests?version=${version}`}>
          Tests
          {/* <StatusDot status="new" /> */}
        </NavLink>
        <NavLink className={styles.link} href={`~compositions?version=${version}`}>
          Compositions
        </NavLink>
        <div className={styles.placeholder} />
      </div>
      <div className={classNames(styles.right, className)} {...rest}>
        <NavLink className={styles.titleLink} href={`/${componentId}?version=${version}`}>
          <H3 size="xs" className={styles.versionTitle}>
            v{version}
          </H3>
        </NavLink>
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
