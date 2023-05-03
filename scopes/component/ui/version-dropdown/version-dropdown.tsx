import React, { useState, ReactNode } from 'react';
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
import { SimpleVersion } from './version-dropdown-placeholder';

export const LOCAL_VERSION = 'workspace';

export type DropdownComponentVersion = Partial<LegacyComponentLog> & { version: string };

const VersionMenu = React.memo(React.forwardRef<HTMLDivElement, VersionMenuProps>(_VersionMenu));

function _VersionMenu(
  {
    currentVersion,
    localVersion,
    latestVersion,
    currentLane,
    overrideVersionHref,
    showVersionDetails,
    activeTabIndex,
    setActiveTab,
    tabs,
    ...rest
  }: VersionMenuProps,
  ref?: React.ForwardedRef<HTMLDivElement>
) {
  const multipleTabs = tabs.length > 1;
  const message = multipleTabs
    ? 'Switch to view tags, snaps, or lanes'
    : `Switch between ${tabs[0].name.toLocaleLowerCase()}s`;

  return (
    <div {...rest}>
      <div className={styles.top}>
        <div className={classNames(styles.titleContainer, styles.title)}>{message}</div>
        {localVersion && (
          <MenuLinkItem
            href={'?'}
            active={currentVersion === LOCAL_VERSION}
            className={classNames(styles.versionRow, styles.localVersion)}
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
      <div className={styles.versionContainer}>
        {tabs[activeTabIndex]?.name === 'LANE' &&
          tabs[activeTabIndex]?.payload.map((payload) => (
            <LaneInfo key={payload.id} currentLane={currentLane} {...payload}></LaneInfo>
          ))}
        {tabs[activeTabIndex]?.name !== 'LANE' &&
          tabs[activeTabIndex]?.payload.map((payload, index) => (
            <VersionInfo
              ref={index === tabs[activeTabIndex]?.payload.length - 1 ? ref : null}
              key={payload.version}
              currentVersion={currentVersion}
              latestVersion={latestVersion}
              overrideVersionHref={overrideVersionHref}
              showDetails={showVersionDetails}
              {...payload}
            ></VersionInfo>
          ))}
      </div>
    </div>
  );
}

export type VersionDropdownProps = {
  tags: DropdownComponentVersion[];
  snaps?: DropdownComponentVersion[];
  lanes?: LaneModel[];
  loadMoreTags?: () => void;
  loadMoreSnaps?: () => void;
  hasMoreTags?: boolean;
  hasMoreSnaps?: boolean;
  localVersion?: boolean;
  currentVersion: string;
  currentLane?: LaneModel;
  latestVersion?: string;
  loading?: boolean;
  overrideVersionHref?: (version: string) => string;
  placeholderClassName?: string;
  dropdownClassName?: string;
  menuClassName?: string;
  showVersionDetails?: boolean;
  disabled?: boolean;
  placeholderComponent?: ReactNode;
} & React.HTMLAttributes<HTMLDivElement>;

export const VersionDropdown = React.memo(React.forwardRef<HTMLDivElement, VersionDropdownProps>(_VersionDropdown));

function _VersionDropdown(
  {
    snaps,
    tags,
    lanes,
    currentVersion,
    latestVersion,
    localVersion,
    loading,
    currentLane,
    overrideVersionHref,
    className,
    placeholderClassName,
    dropdownClassName,
    menuClassName,
    showVersionDetails,
    disabled,
    loadMoreSnaps,
    loadMoreTags,
    hasMoreSnaps,
    hasMoreTags,
    placeholderComponent = (
      <SimpleVersion
        disabled={disabled}
        snaps={snaps}
        tags={tags}
        className={placeholderClassName}
        currentVersion={currentVersion}
      />
    ),
    ...rest
  }: VersionDropdownProps,
  ref?: React.ForwardedRef<HTMLDivElement>
) {
  const VERSION_TAB_NAMES = ['TAG', 'SNAP', 'LANE'] as const;

  const tabs = VERSION_TAB_NAMES.map((name) => {
    switch (name) {
      case 'SNAP':
        return { name, payload: snaps || [] };
      case 'LANE':
        return { name, payload: lanes || [] };
      default:
        return { name, payload: tags || [] };
    }
  }).filter((tab) => tab.payload.length > 0);

  const getActiveTabIndex = () => {
    if (currentLane?.components.some((c) => c.version === currentVersion))
      return tabs.findIndex((tab) => tab.name === 'LANE');
    if ((snaps || []).some((snap) => snap.version === currentVersion))
      return tabs.findIndex((tab) => tab.name === 'SNAP');
    return 0;
  };

  const [activeTabIndex, setActiveTabIndex] = React.useState<number>(getActiveTabIndex());

  const activeTabOrSnap: 'SNAP' | 'TAG' | 'LANE' | undefined = tabs[activeTabIndex]?.name;
  const hasMore = activeTabOrSnap === 'SNAP' ? !!hasMoreSnaps : activeTabOrSnap === 'TAG' && !!hasMoreTags;
  const observer = React.useRef<IntersectionObserver>();

  const handleLoadMore = React.useCallback(() => {
    if (activeTabOrSnap === 'SNAP') loadMoreSnaps?.();
    if (activeTabOrSnap === 'TAG') loadMoreTags?.();
  }, [activeTabOrSnap, tabs.length]);

  const lastLogRef = React.useCallback(
    (node) => {
      if (loading) return;
      if (observer.current) observer.current.disconnect();
      observer.current = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting && hasMore) {
            handleLoadMore();
          }
        },
        {
          threshold: 0.1,
          rootMargin: '100px',
        }
      );
      if (node) observer.current.observe(node);
    },
    [loading, hasMoreSnaps, hasMoreTags, handleLoadMore]
  );

  const [key, setKey] = useState(0);

  const singleVersion = (snaps || []).concat(tags).length < 2 && !localVersion;

  if (disabled || (singleVersion && !loading)) {
    return <div className={classNames(styles.noVersions, className)}>{placeholderComponent}</div>;
  }

  return (
    <div {...rest} className={classNames(styles.versionDropdown, className)}>
      <Dropdown
        className={classNames(styles.dropdown, dropdownClassName)}
        dropClass={classNames(styles.menu, menuClassName)}
        clickToggles={false}
        clickPlaceholderToggles={true}
        onChange={(_e, open) => open && setKey((x) => x + 1)} // to reset menu to initial state when toggling
        PlaceholderComponent={({ children, ...other }) => (
          <div {...other} className={placeholderClassName}>
            {children}
          </div>
        )}
        placeholder={placeholderComponent}
      >
        {loading && <LineSkeleton className={styles.loading} count={6} />}
        {loading || (
          <VersionMenu
            ref={ref || lastLogRef}
            className={menuClassName}
            tabs={tabs}
            key={key}
            activeTabIndex={activeTabIndex}
            setActiveTab={setActiveTabIndex}
            currentVersion={currentVersion}
            latestVersion={latestVersion}
            localVersion={localVersion}
            currentLane={currentLane}
            overrideVersionHref={overrideVersionHref}
            showVersionDetails={showVersionDetails}
          />
        )}
      </Dropdown>
    </div>
  );
}

type VersionMenuProps = {
  localVersion?: boolean;
  currentVersion?: string;
  latestVersion?: string;
  currentLane?: LaneModel;
  overrideVersionHref?: (version: string) => string;
  showVersionDetails?: boolean;
  activeTabIndex: number;
  setActiveTab: (index: number) => void;
  tabs: Array<{ name: string; payload: Array<any> }>;
} & React.HTMLAttributes<HTMLDivElement>;
