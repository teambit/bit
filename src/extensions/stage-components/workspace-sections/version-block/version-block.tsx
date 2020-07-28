import React, { HTMLAttributes } from 'react';
import classNames from 'classnames';
import { H3 } from '@bit/bit.test-scope.ui.heading';
// import { Tag } from '../../../component';
import { NavLink } from '../../../../extensions/react-router/nav-link';
import { StatusDot } from '../../side-bar/component-tree/status-dot/status-dot';
import styles from './version-block.module.scss';
import { AccountObj } from './change-log.data';
import { Contributors } from '../contributors/contributors';
import { Labels } from '../version-label';

export type VersionProps = {
  id: string;
  contributors: AccountObj[];
  timestamp: string;
  message: string;
  isLatest?: boolean;
  isCurrent?: boolean;
};

export type VersionBlockProps = {
  /**
   * component that gets the data of a single tag and displays it in the change log page
   */
  // tag: Tag;
  version: VersionProps;
} & HTMLAttributes<HTMLDivElement>;
/**
 * change log section
 * @name VersionBlock
 */
export function VersionBlock({ version, className, ...rest }: VersionBlockProps) {
  return (
    <div className={styles.versionWrapper}>
      <div className={styles.left}>
        <Labels isLatest={version.isLatest} isCurrent={version.isCurrent} />
        <NavLink className={styles.link} href="~tests">
          Tests
          <StatusDot status="new" />
        </NavLink>
        <NavLink className={styles.link} href="~compositions">
          Compositions
        </NavLink>
      </div>
      <div className={classNames(styles.right, className)} {...rest}>
        <H3 className={styles.versionTitle}>v{version.id}</H3>
        <Contributors contributors={version.contributors} timestamp={version.timestamp} />
        <div className={styles.commitMessage}>{version.message}</div>
      </div>
    </div>
  );
}
