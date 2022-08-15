import { ComponentContext } from '@teambit/component';
import { H1 } from '@teambit/documenter.ui.heading';
import { Separator } from '@teambit/design.ui.separator';
import { VersionBlock } from '@teambit/component.ui.version-block';
import classNames from 'classnames';
import { MDXLayout } from '@teambit/mdx.ui.mdx-layout';
import { ExportingComponents } from '@teambit/component.instructions.exporting-components';
import { AlertCard } from '@teambit/design.ui.alert-card';
import React, { HTMLAttributes, useContext } from 'react';
import { useLanes } from '@teambit/lanes.ui.hooks';
import { Icon } from '@teambit/evangelist.elements.icon';
import { Ellipsis } from '@teambit/design.ui.styles.ellipsis';
import { LaneBreadcrumb } from '@teambit/lanes.ui.gallery';

import styles from './change-log-page.module.scss';

type ChangeLogPageProps = {} & HTMLAttributes<HTMLDivElement>;

export function ChangeLogPage({ className }: ChangeLogPageProps) {
  const component = useContext(ComponentContext);
  const { lanesModel } = useLanes();
  const currentLane = lanesModel?.viewedLane;
  const { logs } = component;

  if (!logs) return null;

  if (logs.length === 0) {
    return (
      <>
        {currentLane && (
          <>
            <div className={styles.lane}>
              <Icon of="lane"></Icon>
              <Ellipsis className={styles.laneName}>{currentLane.id}</Ellipsis>
            </div>
            <Separator isPresentational className={styles.separator} />
          </>
        )}
        <div className={classNames(styles.changeLogPage, className)}>
          <H1 className={styles.title}>History</H1>
          <Separator isPresentational className={styles.separatorNoChangeLog} />
          <AlertCard
            level="info"
            title="There is no change log as this component has not been exported yet.
          Learn how to export components:"
            className={styles.changeLogCard}
          >
            <MDXLayout>
              <ExportingComponents />
            </MDXLayout>
          </AlertCard>
        </div>
      </>
    );
  }

  return (
    <>
      <LaneBreadcrumb lane={currentLane} />
      <Separator isPresentational />
      <div className={classNames(styles.changeLogPage, className)}>
        <H1 className={styles.title}>History</H1>
        <Separator isPresentational className={styles.separator} />
        <div className={styles.logContainer}>
          {logs.map((snap, index) => {
            const isLatest = component.latest === snap.tag || component.latest === snap.hash;
            const isCurrent = component.version === snap.tag || component.version === snap.hash;
            return (
              <VersionBlock
                key={index}
                componentId={component.id.fullName}
                isLatest={isLatest}
                snap={snap}
                isCurrent={isCurrent}
              />
            );
          })}
        </div>
      </div>
    </>
  );
}
