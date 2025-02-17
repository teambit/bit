import React, { useState } from 'react';
import { MenuLinkItem } from '@teambit/design.ui.surfaces.menu.link-item';
import { Dropdown } from '@teambit/evangelist.surfaces.dropdown';
import { Tab } from '@teambit/ui-foundation.ui.use-box.tab';
import { LegacyComponentLog } from '@teambit/legacy-component-log';
import { UserAvatar } from '@teambit/design.ui.avatar';
import { LineSkeleton } from '@teambit/base-ui.loaders.skeleton';
import { LaneModel } from '@teambit/lanes.ui.models.lanes-model';
import classNames from 'classnames';
import styles from './version-dropdown.module.scss';
import { VersionInfo } from './version-info';
import { LaneInfo } from './lane-info';
import { SimpleVersion, VersionProps } from './version-dropdown-placeholder';

export const LOCAL_VERSION = 'workspace';

export type DropdownComponentVersion = Partial<LegacyComponentLog> & { version: string };

export type UseComponentDropdownVersionsResult = {
  tags?: DropdownComponentVersion[];
  snaps?: DropdownComponentVersion[];
  loading?: boolean;
};
export type UseComponentDropdownVersionsProps = {
  skip?: boolean;
};
export type UseComponentDropdownVersions = (
  props?: UseComponentDropdownVersionsProps
) => UseComponentDropdownVersionsResult;
export type GetActiveTabIndex = (
  currentVersion?: string,
  tabs?: Array<VersionMenuTab>,
  tags?: DropdownComponentVersion[],
  snaps?: DropdownComponentVersion[],
  currentLane?: LaneModel
) => number;
export type VersionDropdownProps = {
  localVersion?: boolean;
  latestVersion?: string;
  currentVersion: string;
  useCurrentVersionLog?: (props?: { skip?: boolean; version?: string }) => DropdownComponentVersion | undefined;
  hasMoreVersions?: boolean;
  loading?: boolean;
  useComponentVersions?: UseComponentDropdownVersions;
  currentLane?: LaneModel;
  lanes?: LaneModel[];
  getActiveTabIndex?: GetActiveTabIndex;
  overrideVersionHref?: (version: string) => string;
  placeholderClassName?: string;
  dropdownClassName?: string;
  menuClassName?: string;
  showVersionDetails?: boolean;
  disabled?: boolean;
  PlaceholderComponent?: React.ComponentType<VersionProps>;
} & React.HTMLAttributes<HTMLDivElement>;

export const VersionDropdown = React.memo(_VersionDropdown);
const VersionMenu = React.memo(_VersionMenu);
function _VersionDropdown({
  currentVersion,
  latestVersion,
  localVersion,
  useCurrentVersionLog,
  hasMoreVersions,
  loading,
  overrideVersionHref,
  className,
  placeholderClassName,
  getActiveTabIndex,
  dropdownClassName,
  menuClassName,
  showVersionDetails = true,
  disabled,
  PlaceholderComponent: _PlaceholderComponent,
  currentLane,
  useComponentVersions,
  lanes,
  ...rest
}: VersionDropdownProps) {
  const [key, setKey] = useState(0);
  const singleVersion = !hasMoreVersions;
  const [open, setOpen] = useState(false);

  React.useEffect(() => {
    if (loading && open) {
      setOpen(false);
    }
  }, [loading]);

  const handlePlaceholderClicked = (e: React.MouseEvent<HTMLDivElement>) => {
    if (loading) return;
    if (e.target === e.currentTarget) {
      setOpen((o) => !o);
    }
  };

  const defaultPlaceholder = (
    <SimpleVersion
      useCurrentVersionLog={useCurrentVersionLog}
      disabled={disabled}
      className={placeholderClassName}
      currentVersion={currentVersion}
      onClick={handlePlaceholderClicked}
      hasMoreVersions={hasMoreVersions}
      loading={loading}
      showFullVersion={currentVersion === 'workspace'}
    />
  );

  const PlaceholderComponent = _PlaceholderComponent ? (
    <_PlaceholderComponent
      useCurrentVersionLog={useCurrentVersionLog}
      disabled={disabled}
      className={placeholderClassName}
      currentVersion={currentVersion}
      onClick={handlePlaceholderClicked}
      hasMoreVersions={hasMoreVersions}
      loading={loading}
      showFullVersion={currentVersion === 'workspace'}
    />
  ) : (
    defaultPlaceholder
  );

  if (disabled || (singleVersion && !loading)) {
    return <div className={classNames(styles.noVersions, className)}>{PlaceholderComponent}</div>;
  }

  return (
    <div {...rest} className={classNames(styles.versionDropdown, className)}>
      <Dropdown
        className={classNames(styles.dropdown, dropdownClassName)}
        dropClass={classNames(styles.menu, menuClassName)}
        open={open}
        onClick={handlePlaceholderClicked}
        onClickOutside={() => setOpen(false)}
        onChange={(_e, _open) => _open && setKey((x) => x + 1)} // to reset menu to initial state when toggling
        PlaceholderComponent={({ children, ...other }) => (
          <div {...other} className={placeholderClassName} onClick={handlePlaceholderClicked}>
            {children}
          </div>
        )}
        placeholder={PlaceholderComponent}
      >
        <VersionMenu
          className={menuClassName}
          key={key}
          currentVersion={currentVersion}
          latestVersion={latestVersion}
          localVersion={localVersion}
          overrideVersionHref={overrideVersionHref}
          showVersionDetails={showVersionDetails}
          currentLane={currentLane}
          getActiveTabIndex={getActiveTabIndex}
          lanes={lanes}
          useVersions={useComponentVersions}
          onVersionClicked={() => setOpen(false)}
          open={open}
        />
      </Dropdown>
    </div>
  );
}

type VersionMenuProps = {
  localVersion?: boolean;
  currentVersion?: string;
  latestVersion?: string;
  useVersions?: UseComponentDropdownVersions;
  currentLane?: LaneModel;
  lanes?: LaneModel[];
  overrideVersionHref?: (version: string) => string;
  showVersionDetails?: boolean;
  loading?: boolean;
  getActiveTabIndex?: GetActiveTabIndex;
  open?: boolean;
  onVersionClicked?: () => void;
} & React.HTMLAttributes<HTMLDivElement>;

export type VersionMenuTab =
  | {
      name: 'SNAP';
      payload: DropdownComponentVersion[];
    }
  | {
      name: 'LANE';
      payload: LaneModel[];
    }
  | {
      name: 'TAG';
      payload: DropdownComponentVersion[];
    };

const defaultActiveTabIndex: GetActiveTabIndex = (currentVersion, tabs = [], tags, snaps) => {
  if ((snaps || []).some((snap) => snap.version === currentVersion))
    return tabs.findIndex((tab) => tab.name === 'SNAP');
  return 0;
};

const VERSION_TAB_NAMES = ['TAG', 'SNAP', 'LANE'] as const;
function _VersionMenu({
  currentVersion,
  localVersion,
  latestVersion,
  overrideVersionHref,
  showVersionDetails,
  useVersions,
  currentLane,
  lanes,
  getActiveTabIndex = defaultActiveTabIndex,
  loading: loadingFromProps,
  open,
  onVersionClicked,
  ...rest
}: VersionMenuProps) {
  const { snaps, tags, loading: loadingVersions } = useVersions?.() || {};
  const loading = loadingFromProps || loadingVersions;

  const tabs = React.useMemo(
    () =>
      VERSION_TAB_NAMES.map((name) => {
        switch (name) {
          case 'SNAP':
            return { name, payload: snaps || [] };
          case 'LANE':
            return { name, payload: lanes || [] };
          default:
            return { name, payload: tags || [] };
        }
      }).filter((tab) => tab.payload.length > 0),
    [snaps?.length, tags?.length, lanes?.length, loading]
  );

  const [activeTabIndex, setActiveTab] = React.useState<number | undefined>(
    getActiveTabIndex(currentVersion, tabs, tags, snaps, currentLane)
  );

  const activeTab = React.useMemo(
    () => (activeTabIndex !== undefined ? tabs[activeTabIndex] : undefined),
    [activeTabIndex, tabs]
  );

  React.useEffect(() => {
    if (!currentLane) return;
    if (tabs.length === 0) return;
    const _activeTabIndex = getActiveTabIndex(currentVersion, tabs, tags, snaps, currentLane);
    if (_activeTabIndex !== activeTabIndex) setActiveTab(_activeTabIndex);
  }, [currentLane, tabs.length, tags?.length, snaps?.length, currentVersion, loading]);

  const multipleTabs = tabs.length > 1;
  const message = multipleTabs
    ? 'Switch to view tags, snaps, or lanes'
    : `Switch between ${tabs[0]?.name.toLocaleLowerCase()}s`;

  const showTab = activeTabIndex !== undefined && tabs[activeTabIndex]?.payload.length > 0;

  const _rowRenderer = React.useCallback(
    function VersionRowRenderer({ index }) {
      const { name, payload = [] } = activeTab || {};
      const item = payload[index];
      if (!item) return null;
      if (name === 'LANE') {
        const lane = item as LaneModel;
        return <LaneInfo key={lane.id.toString()} currentLane={currentLane} {...lane}></LaneInfo>;
      }
      const version = item as DropdownComponentVersion;
      return (
        <VersionInfo
          key={version.version}
          currentVersion={currentVersion}
          latestVersion={latestVersion}
          overrideVersionHref={overrideVersionHref}
          showDetails={showVersionDetails}
          onVersionClicked={onVersionClicked}
          {...version}
        ></VersionInfo>
      );
    },
    [activeTab, currentVersion, latestVersion, showVersionDetails, currentLane?.id.toString(), showTab]
  );

  const rowRenderer = React.useMemo(
    () => (showTab && activeTab ? _rowRenderer : () => null),
    [showTab, activeTab, _rowRenderer]
  );

  const ActiveTab = React.useMemo(() => {
    return activeTab?.payload.map((payload, index) => {
      return rowRenderer({ index });
    });
  }, [activeTab]);

  return (
    <div {...rest} className={classNames(styles.versionMenuContainer, !open && styles.hide)}>
      <div className={styles.top}>
        {loading && <LineSkeleton count={6} className={styles.loader} />}
        {!loading && <div className={classNames(styles.titleContainer, styles.title)}>{message}</div>}
        {!loading && localVersion && (
          <MenuLinkItem
            href={'?'}
            active={currentVersion === LOCAL_VERSION}
            className={classNames(styles.versionRow, styles.localVersion)}
            onClick={onVersionClicked}
          >
            <div className={styles.version}>
              <UserAvatar size={24} account={{}} className={styles.versionUserAvatar} />
              <span className={styles.versionName}>{LOCAL_VERSION}</span>
            </div>
          </MenuLinkItem>
        )}
      </div>
      <div className={classNames(multipleTabs && styles.tabs)}>
        {multipleTabs &&
          tabs.map(({ name }, index) => {
            return (
              <Tab
                className={styles.tab}
                key={name}
                isActive={activeTabIndex === index}
                onClick={() => setActiveTab(index)}
              >
                {name}
              </Tab>
            );
          })}
      </div>
      <div className={styles.versionContainerRoot}>{ActiveTab}</div>
    </div>
  );
}
