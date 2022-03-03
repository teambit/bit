import { Icon } from '@teambit/evangelist.elements.icon';
import { NavLink } from '@teambit/base-ui.routing.nav-link';
import { Dropdown } from '@teambit/evangelist.surfaces.dropdown';

import { Ellipsis } from '@teambit/design.ui.styles.ellipsis';
import { Tab } from '@teambit/ui-foundation.ui.use-box.tab';
import { LegacyComponentLog } from '@teambit/legacy-component-log';
import { UserAvatar } from '@teambit/design.ui.avatar';
import { LineSkeleton } from '@teambit/base-ui.loaders.skeleton';
import { LaneModel } from '@teambit/lanes.ui.lanes';
import classNames from 'classnames';
import React, { useState } from 'react';

import styles from './version-dropdown.module.scss';
import { VersionInfo } from './version-info';
import { LaneInfo } from './lane-info';

export const LOCAL_VERSION = 'workspace';

export type DropdownComponentVersion = Partial<LegacyComponentLog> & { version: string };

export type VersionDropdownProps = {
  tags: DropdownComponentVersion[];
  snaps?: DropdownComponentVersion[];
  lanes?: LaneModel[];
  localVersion?: boolean;
  currentVersion?: string;
  currentLane?: LaneModel;
  latestVersion?: string;
  loading?: boolean;
} & React.HTMLAttributes<HTMLDivElement>;

export function VersionDropdown({
  snaps,
  tags,
  lanes,
  currentVersion,
  latestVersion,
  localVersion,
  loading,
  currentLane,
}: VersionDropdownProps) {
  const [key, setKey] = useState(0);

  const singleVersion = (snaps || []).concat(tags).length < 2;

  if (singleVersion && !loading) {
    return (
      <div className={styles.noVersions}>
        <VersionPlaceholder currentVersion={currentVersion} />
      </div>
    );
  }

  return (
    <div className={styles.versionDropdown}>
      <Dropdown
        className={styles.dropdown}
        dropClass={styles.menu}
        clickToggles={false}
        clickPlaceholderToggles={true}
        onChange={(_e, open) => open && setKey((x) => x + 1)} // to reset menu to initial state when toggling
        placeholder={<VersionPlaceholder currentVersion={currentVersion} className={styles.withVersions} />}
      >
        {loading && <LineSkeleton className={styles.loading} count={6} />}
        {loading || (
          <VersionMenu
            key={key}
            tags={tags}
            snaps={snaps}
            lanes={lanes}
            currentVersion={currentVersion}
            latestVersion={latestVersion}
            localVersion={localVersion}
            currentLane={currentLane}
          />
        )}
      </Dropdown>
    </div>
  );
}

function VersionPlaceholder({ currentVersion, className }: { currentVersion?: string; className?: string }) {
  return (
    <div className={classNames(styles.placeholder, className)}>
      <Ellipsis>{currentVersion}</Ellipsis>
      <Icon of="fat-arrow-down" />
    </div>
  );
}
type VersionMenuProps = {
  tags?: DropdownComponentVersion[];
  snaps?: DropdownComponentVersion[];
  lanes?: LaneModel[];
  localVersion?: boolean;
  currentVersion?: string;
  latestVersion?: string;
  currentLane?: LaneModel;
} & React.HTMLAttributes<HTMLDivElement>;

const VERSION_TAB_NAMES = ['TAG', 'SNAP', 'LANE'] as const;

function VersionMenu({
  tags,
  snaps,
  lanes,
  currentVersion,
  localVersion,
  latestVersion,
  currentLane,
  ...rest
}: VersionMenuProps) {
  const [activeTabIndex, setActiveTab] = useState<number>(0);

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

  const multipleTabs = tabs.length > 1;

  return (
    <div {...rest}>
      <div className={styles.top}>
        <div className={classNames(styles.titleContainer, multipleTabs && styles.title)}>
          {multipleTabs && <span>Switch to view tags, snaps, or lanes</span>}
        </div>
        {localVersion && (
          <NavLink
            href={'?'}
            className={classNames(
              styles.versionLine,
              styles.versionRow,
              currentVersion === LOCAL_VERSION && styles.currentVersion
            )}
          >
            <div className={styles.version}>
              <UserAvatar size={20} account={{}} className={styles.versionUserAvatar} />
              <span className={styles.versionName}>{LOCAL_VERSION}</span>
            </div>
          </NavLink>
        )}
      </div>
      <div className={multipleTabs && styles.tabs}>
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
        {tabs[activeTabIndex].name === 'LANE' &&
          tabs[activeTabIndex].payload.map((payload) => (
            <LaneInfo key={payload.id} currentLane={currentLane} {...payload}></LaneInfo>
          ))}
        {tabs[activeTabIndex].name !== 'LANE' &&
          tabs[activeTabIndex].payload.map((payload) => (
            <VersionInfo
              key={payload.hash}
              currentVersion={currentVersion}
              latestVersion={latestVersion}
              {...payload}
            ></VersionInfo>
          ))}
      </div>
    </div>
  );
}
