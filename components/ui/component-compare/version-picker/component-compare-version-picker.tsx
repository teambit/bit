import React, { HTMLAttributes, useMemo } from 'react';
import { DropdownComponentVersion, VersionDropdown } from '@teambit/component.ui.version-dropdown';
import { useUpdatedUrlFromQuery } from '@teambit/component.ui.component-compare.hooks.use-component-compare-url';
import { useComponentCompare } from '@teambit/component.ui.component-compare.context';
import classNames from 'classnames';

import styles from './component-compare-version-picker.module.scss';

export type ComponentCompareVersionPickerProps = {} & HTMLAttributes<HTMLDivElement>;

export function ComponentCompareVersionPicker({ className }: ComponentCompareVersionPickerProps) {
  const componentCompare = useComponentCompare();
  const compare = componentCompare?.compare?.model;

  const logs =
    (compare?.logs || []).filter((log) => {
      const version = log.tag || log.hash;
      return componentCompare?.compare?.hasLocalChanges || version !== compare?.id.version;
    }) || [];

  const [tags, snaps] = useMemo(() => {
    return (logs || []).reduce(
      ([_tags, _snaps], log) => {
        if (!log.tag) {
          _snaps.push({ ...log, version: log.hash });
        } else {
          _tags.push({ ...log, version: log.tag as string });
        }
        return [_tags, _snaps];
      },
      [new Array<DropdownComponentVersion>(), new Array<DropdownComponentVersion>()]
    );
  }, [logs]);

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
        snaps={snaps}
        tags={tags}
        currentVersion={baseVersion as string}
        loading={componentCompare?.loading}
        overrideVersionHref={(_baseVersion) => {
          return useUpdatedUrlFromQuery({ baseVersion: _baseVersion });
        }}
        disabled={snaps.concat(tags).length < 2}
        showVersionDetails={true}
      />
      <div className={styles.titleText}>with</div>
      <VersionDropdown
        className={classNames(styles.componentCompareVersionContainer, styles.right)}
        dropdownClassName={styles.componentCompareDropdown}
        placeholderClassName={styles.componentCompareVersionPlaceholder}
        menuClassName={styles.componentCompareVersionMenu}
        snaps={snaps}
        tags={tags}
        disabled={true}
        loading={componentCompare?.loading}
        currentVersion={compareVersion as string}
      />
    </div>
  );
}
