import React, { HTMLAttributes } from 'react';
import classNames from 'classnames';
import { H1 } from '@bit/bit.evangelist.elements.heading';
import { VersionBlock } from '../../stage-components/workspace-sections/version-block';
import { Version } from '../../stage-components/workspace-page/change-log.data';
import { Separator } from '../../stage-components/workspace-components/separator';
import styles from './change-log-page.module.scss';

type ChangeLogPageProps = {
  versions: Version[];
} & HTMLAttributes<HTMLDivElement>;

// @graphqlConnector()
export function ChangeLogPage({ versions, className }: ChangeLogPageProps) {
  if (!versions) return <div>No tags yet</div>;

  return (
    <div className={classNames(styles.changeLogPage, className)}>
      <H1 className={styles.title}>Changelog</H1>
      <Separator />
      {versions.map((version, index) => (
        <VersionBlock key={index} version={version} />
      ))}
    </div>
  );
}
