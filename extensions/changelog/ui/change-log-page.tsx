import { ComponentContext } from '@teambit/component';
import { H1 } from '@teambit/documenter-temp.ui.heading';
import { Separator } from '@teambit/documenter-temp.ui.separator';
import { VersionBlock } from '@teambit/staged-components.workspace-sections.version-block';
import classNames from 'classnames';
import React, { HTMLAttributes, useContext } from 'react';

import styles from './change-log-page.module.scss';

type ChangeLogPageProps = {} & HTMLAttributes<HTMLDivElement>;

export function ChangeLogPage({ className }: ChangeLogPageProps) {
  const component = useContext(ComponentContext);
  const tags = component.tags.toArray();
  if (!tags || tags.length === 0) return <div>No tags yet</div>;
  const latestVersion = component.tags.getLatest();
  return (
    <div className={classNames(styles.changeLogPage, className)}>
      <H1 className={styles.title}>History</H1>
      <Separator className={styles.separator} />
      {tags.reverse().map((tag, index) => {
        return (
          <VersionBlock
            key={index}
            isLatest={latestVersion === tag.version.toString()}
            {...tag.snap}
            timestamp={tag.snap.timestamp.toString()}
            version={tag.version.toString()}
          />
        );
      })}
      {/* </div> */}
    </div>
  );
}
