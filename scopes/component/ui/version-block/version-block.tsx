import { H3 } from '@teambit/documenter.ui.heading';
import { Contributors } from '@teambit/design.ui.contributors';
import { NavLink } from '@teambit/base-ui.routing.nav-link';
import { Labels } from '@teambit/component.ui.version-label';
import classNames from 'classnames';
import { LegacyComponentLog } from '@teambit/legacy-component-log';
import React, { HTMLAttributes, useMemo } from 'react';

import styles from './version-block.module.scss';

export type VersionBlockProps = {
  componentId: string;
  isLatest: boolean;
  snap: LegacyComponentLog;
} & HTMLAttributes<HTMLDivElement>;
/**
 * change log section
 * @name VersionBlock
 */
export function VersionBlock({ isLatest, className, snap, componentId, ...rest }: VersionBlockProps) {
  const { username, email, message, tag, hash, date } = snap;
  const version = tag || hash;
  const author = useMemo(() => {
    return {
      displayName: username,
      email,
    };
  }, [snap]);
  const timestamp = useMemo(() => (date ? new Date(parseInt(date)).toString() : new Date().toString()), [date]);
  return (
    <div className={classNames(styles.versionWrapper, className)}>
      <div className={styles.left}>
        <Labels isLatest={isLatest} isCurrent={false} />
        <NavLink className={styles.link} href={`~tests?v=${version}`}>
          Tests
        </NavLink>
        <NavLink className={styles.link} href={`~compositions?v=${version}`}>
          Compositions
        </NavLink>
        <div className={styles.placeholder} />
      </div>
      <div className={classNames(styles.right, className)} {...rest}>
        <NavLink className={styles.titleLink} href={`/${componentId}?version=${version}`}>
          <H3 size="xs" className={styles.versionTitle}>
            {tag ? `v${tag}` : hash}
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
