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
} & HTMLAttributes<HTMLDivElement>;

export function ComponentCompareVersionPicker({
  className,
  host,
  customUseComponent,
}: ComponentCompareVersionPickerProps) {
  const componentCompare = useComponentCompare();
  const compare = componentCompare?.compare?.model;
  const componentId = compare?.id.toString();
  const componentWithLogsOptions = {
    customUseComponent,
  };

  const useVersions = (props?: { skip?: boolean }) => {
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
          return componentCompare?.compare?.hasLocalChanges || version !== compare?.id.version;
        }),
      tags: (componentLogs.logs || [])
        .map((tag) => ({ ...tag, version: tag.tag as string }))
        .filter((log) => {
          if (!log.tag) return false;
          const version = log.tag;
          return componentCompare?.compare?.hasLocalChanges || version !== compare?.id.version;
        }),
    };
  };

  const useVersion = (props?: { version?: string; skip?: boolean }) => {
    const { version, skip } = props || {};
    const { tags, snaps, loading } = useVersions({ skip });
    const isTag = React.useMemo(() => semver.valid(version), [loading, version]);
    if (isTag) {
      return React.useMemo(() => tags?.find((tag) => tag.tag === version), [loading, tags?.length, version]);
    }
    return React.useMemo(() => snaps?.find((snap) => snap.version === version), [loading, snaps?.length, version]);
  };

  const compareVersion = componentCompare?.compare?.hasLocalChanges ? 'workspace' : compare?.version;

  const baseVersion = componentCompare?.base?.model.version;

  const key = `base-compare-version-dropdown-${componentCompare?.compare?.model.id.toString()}`;

  return (
    <div className={styles.componentCompareVersionPicker}>
      <div className={classNames(styles.titleText, styles.rightPad)}>Comparing</div>
      <VersionDropdown
        key={key}
        className={classNames(styles.componentCompareVersionContainer, styles.left, className)}
        dropdownClassName={styles.componentCompareDropdown}
        placeholderClassName={styles.componentCompareVersionPlaceholder}
        menuClassName={classNames(styles.componentCompareVersionMenu, styles.showMenuOverNav)}
        currentVersion={baseVersion as string}
        loading={componentCompare?.loading}
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
      <div className={styles.titleText}>with</div>
      <VersionDropdown
        className={classNames(styles.componentCompareVersionContainer, styles.right)}
        dropdownClassName={styles.componentCompareDropdown}
        placeholderClassName={styles.componentCompareVersionPlaceholder}
        menuClassName={styles.componentCompareVersionMenu}
        disabled={true}
        loading={componentCompare?.loading}
        currentVersion={compareVersion as string}
        PlaceholderComponent={DetailedVersion}
        useCurrentVersionLog={useVersion}
        showVersionDetails={true}
      />
    </div>
  );
}
