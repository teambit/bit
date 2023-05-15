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
    overrideVersionHref,
    showVersionDetails,
    useVersions,
    currentLane,
    lanes,
    loading: loadingFromProps,
    ...rest
  }: VersionMenuProps,
  ref?: React.ForwardedRef<HTMLDivElement>
) {
  const {
    snaps,
    tags,
    hasMoreSnaps,
    hasMoreTags,
    loadMoreSnaps,
    loadMoreTags,
    loading: loadingVersions,
  } = useVersions?.() || {};
  const VERSION_TAB_NAMES = ['TAG', 'SNAP', 'LANE'] as const;
  const loading = loadingFromProps || loadingVersions;

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

  const [activeTabIndex, setActiveTab] = React.useState<number>(getActiveTabIndex());

  const activeTabOrSnap: 'SNAP' | 'TAG' | 'LANE' | undefined = tabs[activeTabIndex]?.name;
  const hasMore = activeTabOrSnap === 'SNAP' ? !!hasMoreSnaps : activeTabOrSnap === 'TAG' && !!hasMoreTags;
  const firstObserver = React.useRef<IntersectionObserver>();
  const lastObserver = React.useRef<IntersectionObserver>();

  const handleLoadMore = React.useCallback(
    (backwards?: boolean) => {
      if (activeTabOrSnap === 'SNAP') loadMoreSnaps?.(backwards);
      if (activeTabOrSnap === 'TAG') loadMoreTags?.(backwards);
    },
    [activeTabOrSnap, tabs.length]
  );

  const lastLogRef = React.useCallback(
    (node) => {
      if (loading) return;
      if (lastObserver.current) lastObserver.current.disconnect();
      lastObserver.current = new IntersectionObserver(
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
      if (node) lastObserver.current.observe(node);
    },
    [loading, hasMoreSnaps, hasMoreTags, handleLoadMore]
  );

  const firstLogRef = React.useCallback(
    (node) => {
      if (loading) return;
      if (firstObserver.current) firstObserver.current.disconnect();
      firstObserver.current = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting && hasMore) {
            handleLoadMore(true);
          }
        },
        {
          threshold: 0.1,
          rootMargin: '50px',
        }
      );
      if (node) firstObserver.current.observe(node);
    },
    [loading, hasMoreSnaps, hasMoreTags, handleLoadMore]
  );

  const multipleTabs = tabs.length > 1;
  const message = multipleTabs
    ? 'Switch to view tags, snaps, or lanes'
    : `Switch between ${tabs[0]?.name.toLocaleLowerCase()}s`;

  return (
    <div {...rest}>
      <div className={styles.top}>
        {loading && <LineSkeleton count={6} className={styles.loader} />}
        {!loading && <div className={classNames(styles.titleContainer, styles.title)}>{message}</div>}
        {!loading && localVersion && (
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
          tabs[activeTabIndex]?.payload.map((payload, index) => {
            const _ref =
              index === 0 ? firstLogRef : (index === tabs[activeTabIndex]?.payload.length - 1 && lastLogRef) || ref;
            return (
              <VersionInfo
                ref={_ref}
                key={payload.version}
                currentVersion={currentVersion}
                latestVersion={latestVersion}
                overrideVersionHref={overrideVersionHref}
                showDetails={showVersionDetails}
                {...payload}
              ></VersionInfo>
            );
          })}
      </div>
    </div>
  );
}

export type UseComponentVersionsResult = {
  tags?: DropdownComponentVersion[];
  snaps?: DropdownComponentVersion[];
  loadMoreTags?: (backwards?: boolean) => void;
  loadMoreSnaps?: (backwards?: boolean) => void;
  hasMoreTags?: boolean;
  hasMoreSnaps?: boolean;
  loading?: boolean;
};

export type UseComponentVersions = () => UseComponentVersionsResult;

export type VersionDropdownProps = {
  localVersion?: boolean;
  latestVersion?: string;
  currentVersion: string;
  currentVersionLog?: {
    timestamp?: string | number;
    author?: {
      displayName?: string;
      email?: string;
    };
    message?: string;
  };
  hasMoreVersions?: boolean;
  loading?: boolean;
  useComponentVersions?: UseComponentVersions;
  currentLane?: LaneModel;
  lanes?: LaneModel[];
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
    currentVersion,
    latestVersion,
    localVersion,
    currentVersionLog = {},
    hasMoreVersions,
    loading,
    overrideVersionHref,
    className,
    placeholderClassName,
    dropdownClassName,
    menuClassName,
    showVersionDetails,
    disabled,
    placeholderComponent,
    currentLane,
    useComponentVersions,
    lanes,
    ...rest
  }: VersionDropdownProps,
  ref?: React.ForwardedRef<HTMLDivElement>
) {
  const [key, setKey] = useState(0);
  const singleVersion = !hasMoreVersions;
  const [open, setOpen] = useState(false);

  React.useEffect(() => {
    if (loading && open) {
      setOpen(false);
    }
  }, [loading]);

  const { author, message, timestamp } = currentVersionLog;
  const handlePlaceholderClicked = (e: React.MouseEvent<HTMLDivElement>) => {
    if (loading) return;
    if (e.target === e.currentTarget) {
      setOpen((o) => !o);
    }
  };

  const defaultPlaceholder = (
    <SimpleVersion
      author={author}
      message={message}
      timestamp={timestamp}
      disabled={disabled}
      className={placeholderClassName}
      currentVersion={currentVersion}
      onClick={handlePlaceholderClicked}
      hasMoreVersions={hasMoreVersions}
      loading={loading}
    />
  );

  const PlaceholderComponent = placeholderComponent || defaultPlaceholder;

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
        {open && (
          <VersionMenu
            ref={ref}
            className={menuClassName}
            key={key}
            currentVersion={currentVersion}
            latestVersion={latestVersion}
            localVersion={localVersion}
            overrideVersionHref={overrideVersionHref}
            showVersionDetails={showVersionDetails}
            currentLane={currentLane}
            lanes={lanes}
            useVersions={useComponentVersions}
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
  useVersions?: UseComponentVersions;
  currentLane?: LaneModel;
  lanes?: LaneModel[];
  overrideVersionHref?: (version: string) => string;
  showVersionDetails?: boolean;
  loading?: boolean;
} & React.HTMLAttributes<HTMLDivElement>;
