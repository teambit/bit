import React, { HTMLAttributes, useContext, useMemo } from 'react';
import compact from 'lodash.compact';
import { LegacyComponentLog } from '@teambit/legacy-component-log';
import { DropdownComponentVersion, VersionDropdown } from '@teambit/component.ui.version-dropdown';
import { useComponentCompare, useUpdatedUrlFromQuery } from '@teambit/component.ui.compare';
import { ComponentContext } from '@teambit/component';
import classNames from 'classnames';
import styles from './component-compare-version-picker.module.scss';

export type ComponentCompareVersionPickerProps = {} & HTMLAttributes<HTMLDivElement>;

export function ComponentCompareVersionPicker({ className }: ComponentCompareVersionPickerProps) {
  const component = useContext(ComponentContext);
  const componentCompare = useComponentCompare();

  const snaps: DropdownComponentVersion[] = useMemo(() => {
    const logs = component?.logs;
    return (logs || [])
      .filter((log) => !log.tag)
      .map((snap) => ({ ...snap, version: snap.hash }))
      .reverse();
  }, [component?.logs]);

  const tags: DropdownComponentVersion[] = useMemo(() => {
    const tagLookup = new Map<string, LegacyComponentLog>();
    const logs = component?.logs;

    (logs || [])
      .filter((log) => log.tag)
      .forEach((tag) => {
        tagLookup.set(tag?.tag as string, tag);
      });
    return compact(
      component?.tags
        ?.toArray()
        .reverse()
        .map((tag) => tagLookup.get(tag.version.version))
    ).map((tag) => ({ ...tag, version: tag.tag as string }));
  }, [component?.logs]);

  const compareVersion = componentCompare?.compareIsLocalChanges ? 'workspace' : componentCompare?.compare.version;

  const baseVersion = componentCompare?.base?.version;

  const key = `base-compare-version-dropdown-${componentCompare?.compare.id.toString()}`;

  return (
    <div className={styles.componentCompareVersionPicker}>
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
        showVersionDetails={true}
      />
      <div className={styles.arrowContainer}>
        <img src="https://static.bit.dev/bit-icons/arrow-left.svg" />
      </div>
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
        showVersionDetails={true}
      />
    </div>
  );
}
