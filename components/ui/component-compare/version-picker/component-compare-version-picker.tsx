import React, { HTMLAttributes, useMemo, useState, useContext } from 'react';
import classNames from 'classnames';
import { DropdownComponentVersion, VersionDropdown } from '@teambit/component.ui.version-dropdown';
import {
  useCompareQueryParam,
  useUpdatedUrlFromQuery,
} from '@teambit/component.ui.component-compare.hooks.use-component-compare-url';
import { ComponentCompareIcon } from '@teambit/component.ui.component-compare.component-compare-icon';
import { ComponentContext, ComponentModel } from '@teambit/component';
import { MenuLinkItem } from '@teambit/design.ui.surfaces.menu.link-item';

import styles from './component-compare-version-picker.module.scss';

export type ComponentCompareVersionPickerProps = {
  useComponent?: () => ComponentModel;
  dropdownClassName?: string;
  placeholderClassName?: string;
  dropdownMenuClassName?: string;
} & HTMLAttributes<HTMLDivElement>;

function getBaseVersion(
  baseVersion?: string,
  tags: Array<DropdownComponentVersion> = [],
  snaps: Array<DropdownComponentVersion> = []
) {
  if (baseVersion) {
    return baseVersion;
  }

  if (tags.length > 0) {
    return tags[0].version;
  }

  if (snaps.length > 0) {
    return snaps[0].version;
  }

  return undefined;
}

export function ComponentCompareVersionPicker({
  className,
  useComponent = () => useContext(ComponentContext),
  dropdownClassName,
  placeholderClassName,
  dropdownMenuClassName,
  ...rest
}: ComponentCompareVersionPickerProps) {
  const component = useComponent();
  const baseVersionFromParams = useCompareQueryParam('baseVersion') ?? null;

  let baseVersion: string | undefined;
  const logs =
    (component?.logs || []).filter((log) => {
      const version = log.tag || log.hash;
      if (version === baseVersionFromParams) baseVersion = version;
      return version !== component.version;
    }) || [];

  const defaultVisibility = !!baseVersion && baseVersion !== component.id.version;
  const [isDropdownVisible, setDropdownVisibility] = useState(defaultVisibility);

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

  const handleCompareIconClicked = () => {
    setDropdownVisibility((v) => !v);
  };

  baseVersion = getBaseVersion(baseVersion, tags, snaps);

  return (
    <div {...rest} className={classNames(styles.componentCompareVersionPicker, className)}>
      <MenuLinkItem
        href={useUpdatedUrlFromQuery({ baseVersion: isDropdownVisible ? null : baseVersion })}
        className={classNames(styles.compareIcon)}
        onClick={handleCompareIconClicked}
      >
        <ComponentCompareIcon />
      </MenuLinkItem>
      {isDropdownVisible && (
        <VersionDropdown
          className={classNames(styles.componentCompareVersionContainer, styles.left, dropdownClassName)}
          dropdownClassName={classNames(styles.componentCompareDropdown, dropdownClassName)}
          placeholderClassName={classNames(styles.componentCompareVersionPlaceholder, placeholderClassName)}
          menuClassName={classNames(styles.componentCompareVersionMenu, styles.showMenuOverNav, dropdownMenuClassName)}
          snaps={snaps}
          tags={tags}
          currentVersion={baseVersion || tags[0].version}
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
