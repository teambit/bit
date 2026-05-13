import React from 'react';
import { CompareStatusResolver } from '@teambit/component.ui.component-compare.status-resolver';
import { MenuWidgetIcon } from '@teambit/ui-foundation.ui.menu-widget-icon';
import styles from './deps-diff-table.module.scss';

// --- Types ---

export type DepStatus = 'new' | 'deleted' | 'modified' | 'unchanged';

export type DepDiffEntry = {
  id: string;
  packageName?: string;
  baseVersion?: string;
  compareVersion?: string;
  lifecycle?: string;
  baseLifecycle?: string;
  status: DepStatus;
  isComponent?: boolean;
  compareUrl?: string;
  componentId?: any;
  baseComponentId?: any;
};

export type DepsDiffTableProps = {
  entries: DepDiffEntry[];
  baseLabel?: string;
  compareLabel?: string;
};

// --- Pure Dependency Diff Utilities ---

export type RawDep = {
  id: string;
  version: string;
  lifecycle?: string;
  packageName?: string;
  source?: string;
  componentId?: any;
  __type?: string;
  type?: string;
};

export function computeDepsDiff(baseDeps: RawDep[], compareDeps: RawDep[]): DepDiffEntry[] {
  const getKey = (dep: RawDep) => dep.id.split(`@${dep.version}`)[0];

  const baseMap = new Map<string, RawDep>(baseDeps.map((d) => [getKey(d), d]));
  const compareMap = new Map<string, RawDep>(compareDeps.map((d) => [getKey(d), d]));

  const entries: DepDiffEntry[] = [];

  for (const dep of compareDeps) {
    const key = getKey(dep);
    if (!baseMap.has(key)) {
      entries.push({
        id: key,
        packageName: dep.packageName,
        compareVersion: dep.version,
        lifecycle: dep.lifecycle,
        status: 'new',
        isComponent: Boolean(dep.componentId),
        componentId: dep.componentId,
      });
    }
  }

  for (const dep of baseDeps) {
    const key = getKey(dep);
    if (!compareMap.has(key)) {
      entries.push({
        id: key,
        packageName: dep.packageName,
        baseVersion: dep.version,
        lifecycle: dep.lifecycle,
        status: 'deleted',
        isComponent: Boolean(dep.componentId),
        componentId: dep.componentId,
      });
    }
  }

  for (const dep of compareDeps) {
    const key = getKey(dep);
    const baseDep = baseMap.get(key);
    if (baseDep && baseDep.version !== dep.version) {
      entries.push({
        id: key,
        packageName: dep.packageName,
        baseVersion: baseDep.version,
        compareVersion: dep.version,
        lifecycle: dep.lifecycle,
        baseLifecycle: baseDep.lifecycle,
        status: 'modified',
        isComponent: Boolean(dep.componentId),
        componentId: dep.componentId,
        baseComponentId: baseDep.componentId,
      });
    }
  }

  for (const dep of compareDeps) {
    const key = getKey(dep);
    const baseDep = baseMap.get(key);
    if (baseDep && baseDep.version === dep.version) {
      entries.push({
        id: key,
        packageName: dep.packageName,
        baseVersion: baseDep.version,
        compareVersion: dep.version,
        lifecycle: dep.lifecycle,
        status: 'unchanged',
        isComponent: Boolean(dep.componentId),
        componentId: dep.componentId,
      });
    }
  }

  return entries;
}

// --- Pure Table Renderer ---

const shortenVersion = (v?: string) => (v?.includes('.') ? v : v?.substring(0, 6));

export function DepsDiffTable({ entries, baseLabel = 'Base', compareLabel = 'Compare' }: DepsDiffTableProps) {
  if (entries.length === 0) {
    return <div className={styles.empty}>No dependency changes</div>;
  }

  return (
    <div className={styles.container}>
      <table className={styles.table}>
        <thead>
          <tr className={styles.headerRow}>
            <th className={styles.statusCol} />
            <th className={styles.depCol}>Dependency</th>
            <th className={styles.versionCol}>{baseLabel}</th>
            <th className={styles.versionCol}>{compareLabel}</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id} className={styles.row}>
              <td className={styles.statusCol}>
                {entry.status !== 'unchanged' && <CompareStatusResolver status={entry.status} />}
              </td>
              <td className={styles.depCol}>
                <span className={styles.depId}>{entry.id}</span>
                {entry.lifecycle && <span className={styles.depLifecycle}>{entry.lifecycle}</span>}
              </td>
              <td className={`${styles.versionCol} ${entry.status === 'deleted' ? styles.deleted : ''}`}>
                {shortenVersion(entry.baseVersion) || '—'}
                {entry.baseLifecycle && entry.baseLifecycle !== entry.lifecycle && (
                  <span className={styles.depLifecycle}>{entry.baseLifecycle}</span>
                )}
              </td>
              <td
                className={`${styles.versionCol} ${entry.status === 'new' ? styles.new : entry.status === 'modified' ? styles.modified : ''}`}
              >
                <span className={styles.versionWithIcon}>
                  <span className={styles.fixedWidthVersion}>{shortenVersion(entry.compareVersion) || '—'}</span>
                  {entry.compareUrl && (
                    <a
                      className={styles.compareUrl}
                      href={entry.compareUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="compare url"
                    >
                      <MenuWidgetIcon
                        className={styles.compareIcon}
                        icon="compare"
                        tooltipContent={
                          <span>
                            Comparing v{shortenVersion(entry.compareVersion)} with v{shortenVersion(entry.baseVersion)}
                          </span>
                        }
                      />
                    </a>
                  )}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
