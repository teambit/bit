import React, { HTMLAttributes, useContext, useMemo } from 'react';
import compact from 'lodash.compact';
import { LegacyComponentLog } from '@teambit/legacy-component-log';
import { DropdownComponentVersion, VersionDropdown } from '@teambit/component.ui.version-dropdown';
import { useComponentCompareContext } from '@teambit/component.ui.component-compare';
import { ComponentContext } from '@teambit/component';
import styles from './component-compare-version-picker.module.scss';
import { S } from 'memfs/lib/constants';

export type ComponentCompareVersionPickerProps = {} & HTMLAttributes<HTMLDivElement>;

export function ComponentCompareVersionPicker({}: ComponentCompareVersionPickerProps) {
  const component = useContext(ComponentContext);
  const componentCompare = useComponentCompareContext();

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

  return (
    <div className={styles.componentCompareVersionPicker}>
      <VersionDropdown
        className={styles.componentCompareVersionContainer}
        placeholderClassName={styles.componentCompareVersionPlaceholder}
        menuClassName={styles.componentCompareVersionMenu}
        snaps={snaps}
        tags={tags}
        currentVersion={componentCompare?.base.id.version}
        loading={componentCompare?.loading}
        overrideVersionHref={(version) => `?base=${version}`}
      />
      <VersionDropdown
        className={styles.componentCompareVersionContainer}
        placeholderClassName={styles.componentCompareVersionPlaceholder}
        menuClassName={styles.componentCompareVersionMenu}
        snaps={snaps}
        tags={tags}
        loading={componentCompare?.loading}
        currentVersion={componentCompare?.compare.id.version}
      />
    </div>
  );
}
