import React, { HTMLAttributes, useMemo, useState, useContext } from 'react';
import classNames from 'classnames';
import { DropdownComponentVersion, VersionDropdown } from '@teambit/component.ui.version-dropdown';
import {
  useCompareQueryParam,
  useUpdatedUrlFromQuery,
} from '@teambit/component.ui.component-compare.hooks.use-component-compare-url';
// import { useComponentCompare } from '@teambit/component.ui.component-compare.context';
import { ComponentCompareIcon } from '@teambit/component.ui.component-compare.component-compare-icon';
import { ComponentContext, ComponentModel } from '@teambit/component';

import styles from './component-compare-version-picker.module.scss';

export type ComponentCompareVersionPickerProps = {
  useComponent?: () => ComponentModel;
  dropdownClassName?: string;
  placeholderClassName?: string;
  dropdownMenuClassName?: string;
} & HTMLAttributes<HTMLDivElement>;

export function ComponentCompareVersionPicker({
  className,
  useComponent = () => useContext(ComponentContext),
  dropdownClassName,
  placeholderClassName,
  dropdownMenuClassName,
  ...rest
}: ComponentCompareVersionPickerProps) {
  const component = useComponent();
  const baseVersion = useCompareQueryParam('baseVersion');

  const [isDropdownVisible, setDropdownVisibility] = useState(!!baseVersion);

  const logs =
    (component?.logs || []).filter((log) => {
      const version = log.tag || log.hash;
      return version !== component.version;
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

  // const baseVersion = componentCompare?.base?.model.version;

  // const key = `base-compare-version-dropdown-${componentCompare?.compare?.model.id.toString()}`;

  const handleCompareIconClicked = () => {
    setDropdownVisibility((v) => !v);
  };

  return (
    <div {...rest} className={classNames(styles.componentCompareVersionPicker, className)}>
      <div className={classNames(styles.compareIcon, styles.rightPad)} onClick={handleCompareIconClicked}>
        <ComponentCompareIcon />
      </div>
      {isDropdownVisible && (
        <VersionDropdown
          // key={key}
          className={classNames(styles.componentCompareVersionContainer, styles.left, dropdownClassName)}
          dropdownClassName={classNames(styles.componentCompareDropdown, dropdownClassName)}
          placeholderClassName={classNames(styles.componentCompareVersionPlaceholder, placeholderClassName)}
          menuClassName={classNames(styles.componentCompareVersionMenu, styles.showMenuOverNav, dropdownMenuClassName)}
          snaps={snaps}
          tags={tags}
          currentVersion={baseVersion || tags[0].version}
          // loading={componentCompare?.loading}
          overrideVersionHref={(_baseVersion) => {
            return useUpdatedUrlFromQuery({ baseVersion: _baseVersion });
          }}
          disabled={snaps.concat(tags).length < 2}
          showVersionDetails={true}
        />
      )}
    </div>
  );
}
