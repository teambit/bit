import React, { HTMLAttributes, useMemo, useContext } from 'react';
import { useComponentCompare } from '@teambit/component.ui.compare';
import { LegacyComponentLog } from '@teambit/legacy-component-log';
import { VersionBlock } from '@teambit/component.ui.version-block';
import { ComponentContext } from '@teambit/component';
import classNames from 'classnames';

import styles from './component-compare-changelog.module.scss';

export type ComponentCompareChangelog = {} & HTMLAttributes<HTMLDivElement>;

const compareByDate = (logA?: LegacyComponentLog, logB?: LegacyComponentLog) => {
  const { date: dateStrA } = logA || {};
  const { date: dateStrB } = logB || {};

  const dateA = useMemo(() => (dateStrA ? new Date(parseInt(dateStrA)) : new Date()), [dateStrA]);
  const dateB = useMemo(() => (dateStrB ? new Date(parseInt(dateStrB)) : new Date()), [dateStrB]);

  if (dateA < dateB) return 1;
  if (dateB < dateA) return -1;
  return 0;
};

export function ComponentCompareChangelog({ className }: ComponentCompareChangelog) {
  const component = useContext(ComponentContext);
  const componentCompareContext = useComponentCompare();
  const { base, compare } = componentCompareContext || {};

  const allLogs = compare?.model.logs || [];
  const baseVersionInfo = base?.versionInfo;
  const compareVersionInfo = compare?.versionInfo;

  const startingVersion = useMemo(
    () => (compareByDate(baseVersionInfo, compareVersionInfo) === 1 ? baseVersionInfo : compareVersionInfo),
    [base?.model.id, compare?.model.id]
  );

  const endingVersion = startingVersion?.hash === baseVersionInfo?.hash ? compareVersionInfo : baseVersionInfo;

  const startingVersionIndex = useMemo(
    () => allLogs.findIndex((log) => log.hash === startingVersion?.hash),
    [startingVersion]
  );
  const endingVersionIndex = useMemo(
    () => allLogs.findIndex((log) => log.hash === endingVersion?.hash),
    [base?.model.id, compare?.model.id]
  );
  const logsBetweenVersions = useMemo(
    () => allLogs.filter((_, index) => index >= startingVersionIndex && index <= endingVersionIndex),
    [endingVersion]
  );

  return (
    <div className={classNames(styles.changeLogPage, className)}>
      {logsBetweenVersions.map((snap, index) => {
        const isLatest = component.latest === snap.tag || component.latest === snap.hash;
        const isCurrent = component.version === snap.tag || component.version === snap.hash;
        return (
          <VersionBlock
            isCurrent={isCurrent}
            isLatest={isLatest}
            key={index}
            componentId={component.id.fullName}
            snap={snap}
          />
        );
      })}
    </div>
  );
}
