import { H3 } from '@teambit/documenter.ui.heading';
import { Contributors } from '@teambit/design.ui.contributors';
import { Link, useLocation } from '@teambit/base-react.navigation.link';
import { Labels } from '@teambit/component.ui.version-label';
import classNames from 'classnames';
import React, { HTMLAttributes, useMemo } from 'react';
import { LegacyComponentLog } from '@teambit/legacy-component-log';
import { Tooltip } from '@teambit/design.ui.tooltip';
import { useLanes } from '@teambit/lanes.hooks.use-lanes';
import { LanesModel } from '@teambit/lanes.ui.models.lanes-model';

import styles from './version-block.module.scss';

export type VersionBlockProps = {
  componentId: string;
  isLatest: boolean;
  snap: LegacyComponentLog;
  isCurrent: boolean;
} & HTMLAttributes<HTMLDivElement>;
/**
 * change log section
 * @name VersionBlock
 */
export function VersionBlock({ isLatest, className, snap, componentId, isCurrent, ...rest }: VersionBlockProps) {
  const { username, email, message, tag, hash, date } = snap;
  const { lanesModel } = useLanes();
  const currentLaneUrl = lanesModel?.isViewingNonDefaultLane()
    ? // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      `${LanesModel.getLaneUrl(lanesModel.viewedLane!.id)}${LanesModel.baseLaneComponentRoute}`
    : '';

  const version = tag || hash;
  const author = useMemo(() => {
    return {
      displayName: username,
      email,
    };
  }, [snap]);

  const timestamp = useMemo(() => (date ? new Date(parseInt(date)).toString() : new Date().toString()), [date]);
  const location = useLocation();
  const { pathname, search } = location || {};

  const testsPath = `${pathname?.replace('~changelog', '~tests')}${search}`;
  const compositionsPath = `${pathname?.replace('~changelog', '~compositions')}${search}`;

  return (
    <div className={classNames(styles.versionWrapper, className)}>
      <div className={styles.left}>
        <Labels isLatest={isLatest} isCurrent={isCurrent} />
        <Link className={styles.link} href={testsPath}>
          Tests
        </Link>
        <Link className={styles.link} href={compositionsPath}>
          Compositions
        </Link>
        <div className={styles.placeholder} />
      </div>
      <div className={classNames(styles.right, className)} {...rest}>
        <Tooltip placement="right" content={hash}>
          <Link className={styles.titleLink} href={`${currentLaneUrl}/${componentId}?version=${version}`}>
            <H3 size="xs" className={styles.versionTitle}>
              {tag ? `v${tag}` : hash}
            </H3>
          </Link>
        </Tooltip>
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
