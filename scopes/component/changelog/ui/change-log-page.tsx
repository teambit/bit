import { ComponentContext } from '@teambit/component';
import { H1 } from '@teambit/documenter.ui.heading';
import { Separator } from '@teambit/documenter.ui.separator';
import { VersionBlock } from '@teambit/ui.version-block';
import { EmptyBox } from '@teambit/ui.empty-box';
import classNames from 'classnames';
import { useSnaps } from './getlogs';
import React, { HTMLAttributes, useContext } from 'react';

import styles from './change-log-page.module.scss';

type ChangeLogPageProps = {} & HTMLAttributes<HTMLDivElement>;

export function ChangeLogPage({ className }: ChangeLogPageProps) {
  const component = useContext(ComponentContext);
  const { snaps, loading } = useSnaps(component.id);

  if (!snaps && !loading) {
    return (
      <EmptyBox
        title="This component is new and doesn’t have a changelog yet."
        linkText="Learn more about component versioning"
        link="https://docs.bit.dev/docs/tag-component-version"
      />
    );
  }

  if (!snaps) return null;

  const latestVersion = snaps[0].tag;
  return (
    <div className={classNames(styles.changeLogPage, className)}>
      <H1 className={styles.title}>History</H1>
      <Separator className={styles.separator} />
      {snaps.map((snap, index) => {
        const author = {
          displayName: snap.username,
          email: snap.email,
        };
        const timeStamp = new Date(parseInt(snap.date)).toString();

        return (
          <VersionBlock
            key={index}
            componentId={component.id.fullName}
            isLatest={latestVersion === snap.tag}
            message={snap.message}
            author={author}
            timestamp={timeStamp}
            version={snap.tag}
          />
        );
      })}
    </div>
  );
}
