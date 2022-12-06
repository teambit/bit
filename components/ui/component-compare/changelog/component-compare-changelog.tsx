import React, { HTMLAttributes, useMemo, useContext } from 'react';
import { LegacyComponentLog } from '@teambit/legacy-component-log';
import { VersionBlock } from '@teambit/component.ui.version-block';
import { ComponentContext } from '@teambit/component';
import classNames from 'classnames';
import { useComponentCompare } from '@teambit/component.ui.component-compare.context';

import styles from './component-compare-changelog.module.scss';

export type ComponentCompareChangelog = {} & HTMLAttributes<HTMLDivElement>;

const orderByDateDsc: (
  logA?: LegacyComponentLog,
  logB?: LegacyComponentLog
) => [LegacyComponentLog | undefined, LegacyComponentLog | undefined] = (logA, logB) => {
  const { date: dateStrB } = logB || {};
  const { date: dateStrA } = logA || {};

  const dateA = dateStrA ? new Date(parseInt(dateStrA)) : new Date();
  const dateB = dateStrB ? new Date(parseInt(dateStrB)) : new Date();

  if (dateA <= dateB) return [logB, logA];
  return [logA, logB];
};

const sortByDateDsc: (logA?: LegacyComponentLog, logB?: LegacyComponentLog) => 1 | -1 | 0 = (logA, logB) => {
  const { date: dateStrB } = logB || {};
  const { date: dateStrA } = logA || {};

  const dateA = dateStrA ? new Date(parseInt(dateStrA)) : new Date();
  const dateB = dateStrB ? new Date(parseInt(dateStrB)) : new Date();

  if (dateA > dateB) return -1;
  return 1;
};

const getLogsBetweenVersions: (
  allLogs: LegacyComponentLog[],
  baseVersion?: LegacyComponentLog,
  compareVersion?: LegacyComponentLog
) => LegacyComponentLog[] = (allLogs, baseVersion, compareVersion) => {
  const [startingVersion, endingVersion] = orderByDateDsc(baseVersion, compareVersion);
  const { startingVersionIndex, endingVersionIndex } = allLogs.reduce((accum, next, index) => {
    if (next.hash === startingVersion?.hash) {
      accum = { ...accum, startingVersionIndex: index };
    }
    if (next.hash === endingVersion?.hash) {
      accum = { ...accum, endingVersionIndex: index };
    }
    return accum;
  }, {} as { startingVersionIndex: number; endingVersionIndex: number });

  return allLogs.filter((_, index) => index >= startingVersionIndex && index <= endingVersionIndex);
};

export function ComponentCompareChangelog({ className }: ComponentCompareChangelog) {
  const component = useContext(ComponentContext);
  const componentCompareContext = useComponentCompare();
  const { base, compare, logsByVersion } = componentCompareContext || {};

  const allLogs = useMemo(
    () => (compare?.model.logs || []).slice().sort(sortByDateDsc),
    [compare?.model.id.toString()]
  );

  const baseVersionInfo = base?.model.version ? logsByVersion?.get(base?.model.version) : undefined;
  const compareVersionInfo = compare?.model.version ? logsByVersion?.get(compare?.model.version) : undefined;

  const logs = useMemo(
    () => getLogsBetweenVersions(allLogs, baseVersionInfo, compareVersionInfo),
    [baseVersionInfo?.hash, compareVersionInfo?.hash]
  );

  return (
    <div className={classNames(styles.changeLogPage, className)}>
      {logs.map((snap, index) => {
        const isLatest = component.latest === snap.tag || component.latest === snap.hash;
        const isCurrent = component.version === snap.tag || component.version === snap.hash;
        return (
          <VersionBlock
            isCurrent={isCurrent}
            isLatest={isLatest}
            key={`comp-compare-changelog-${index}`}
            componentId={component.id.fullName}
            snap={snap}
          />
        );
      })}
    </div>
  );
}
