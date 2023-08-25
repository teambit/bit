import React, { HTMLAttributes } from 'react';
import { DetailedVersion, VersionDropdown } from '@teambit/component.ui.version-dropdown';
import { useUpdatedUrlFromQuery } from '@teambit/component.ui.component-compare.hooks.use-component-compare-url';
import { useComponentCompare } from '@teambit/component.ui.component-compare.context';
import { UseComponentType, useComponent } from '@teambit/component';
import classNames from 'classnames';
import * as semver from 'semver';

import styles from './component-compare-version-picker.module.scss';

export type ComponentCompareVersionPickerProps = {
  customUseComponent?: UseComponentType;
  host: string;
  baseVersion?: string;
  compareVersion?: string;
  compareHasLocalChanges?: boolean;
  componentId: string;
} & HTMLAttributes<HTMLDivElement>;

export function ComponentCompareVersionPicker({
  className,
  host,
  customUseComponent,
  compareVersion: compareVersionFromProps,
  baseVersion: baseVersionFromProps,
  componentId: componentIdFromProps,
  compareHasLocalChanges,
}: ComponentCompareVersionPickerProps) {
  const componentCompare = useComponentCompare();
  const compare = componentCompare?.compare?.model;
  const componentId = componentIdFromProps || compare?.id.toStringWithoutVersion();
  const compareVersion = compareHasLocalChanges ? 'workspace' : compareVersionFromProps || compare?.version;
  const baseVersion = baseVersionFromProps || componentCompare?.base?.model.version;

  const componentWithLogsOptions = {
    customUseComponent,
  };

  const useVersions = React.useCallback(
    (props?: { skip?: boolean }) => {
      const { skip } = props || {};
      const { componentLogs = {}, loading: loadingLogs } = useComponent(host, componentId, {
        ...componentWithLogsOptions,
        skip,
      });
      return {
        loading: loadingLogs,
        ...componentLogs,
        snaps: (componentLogs.logs || [])
          .map((snap) => ({ ...snap, version: snap.hash }))
          .filter((log) => {
            if (log.tag) return false;
            const version = log.hash;
            return compareHasLocalChanges || version !== compare?.id.version;
          }),
        tags: (componentLogs.logs || [])
          .map((tag) => ({ ...tag, version: tag.tag as string }))
          .filter((log) => {
            if (!log.tag) return false;
            const version = log.tag;
            return compareHasLocalChanges || version !== compare?.id.version;
          }),
      };
    },
    [componentId, compareHasLocalChanges]
  );

  const useVersion = (props?: { version?: string; skip?: boolean }) => {
    const { version, skip } = props || {};
    const { tags, snaps, loading } = useVersions({ skip });
    const isTag = React.useMemo(() => semver.valid(version), [loading, version]);
    if (isTag) {
      return React.useMemo(() => tags?.find((tag) => tag.tag === version), [loading, tags?.length, version]);
    }
    return React.useMemo(() => snaps?.find((snap) => snap.version === version), [loading, snaps?.length, version]);
  };

  return (
    <div className={styles.componentCompareVersionPicker}>
      <div className={classNames(styles.dropdownContainer)}>
        <span className={classNames(styles.rightPad, styles.titleText)}>Comparing</span>
        <VersionDropdown
          className={classNames(styles.componentCompareVersionContainer, styles.left, className)}
          dropdownClassName={styles.componentCompareDropdown}
          placeholderClassName={styles.componentCompareVersionPlaceholder}
          menuClassName={classNames(styles.componentCompareVersionMenu, styles.showMenuOverNav)}
          currentVersion={baseVersion as string}
          overrideVersionHref={(_baseVersion) => {
            return useUpdatedUrlFromQuery({ baseVersion: _baseVersion });
          }}
          disabled={(compare?.logs?.length ?? 0) < 2}
          hasMoreVersions={(compare?.logs?.length ?? 0) > 1}
          showVersionDetails={true}
          useComponentVersions={useVersions}
          useCurrentVersionLog={useVersion}
          PlaceholderComponent={DetailedVersion}
        />
      </div>
      <div className={styles.dropdownContainer}>
        <span className={styles.titleText}>With</span>
        <VersionDropdown
          className={classNames(styles.componentCompareVersionContainer, styles.right)}
          dropdownClassName={styles.componentCompareDropdown}
          placeholderClassName={styles.componentCompareVersionPlaceholder}
          menuClassName={styles.componentCompareVersionMenu}
          disabled={true}
          currentVersion={compareVersion as string}
          PlaceholderComponent={DetailedVersion}
          useCurrentVersionLog={useVersion}
          showVersionDetails={true}
        />
      </div>
    </div>
  );
}
