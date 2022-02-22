import { Icon } from '@teambit/evangelist.elements.icon';
import { NavLink } from '@teambit/base-ui.routing.nav-link';
import { Dropdown } from '@teambit/evangelist.surfaces.dropdown';
import { TimeAgo } from '@teambit/design.ui.time-ago';
import { VersionLabel } from '@teambit/component.ui.version-label';
import { Ellipsis } from '@teambit/design.ui.styles.ellipsis';
import { Tab } from '@teambit/ui-foundation.ui.use-box.tab';
import { LegacyComponentLog } from '@teambit/legacy-component-log';
import { UserAvatar } from '@teambit/design.ui.avatar';

import { LaneModel } from '@teambit/lanes.ui.lanes';
import classNames from 'classnames';
import React, { useState, useMemo } from 'react';

import styles from './version-dropdown.module.scss';

const LOCAL_VERSION = 'workspace';

export type DropdownComponentVersion = Partial<LegacyComponentLog> & { version: string };

export type VersionDropdownProps = {
  tags: DropdownComponentVersion[];
  snaps?: DropdownComponentVersion[];
  lanes?: LaneModel[];
  localVersion?: boolean;
  currentVersion?: string;
  latestVersion?: string;
} & React.HTMLAttributes<HTMLDivElement>;

export function VersionDropdown({
  snaps,
  tags,
  lanes,
  currentVersion,
  latestVersion,
  localVersion,
}: VersionDropdownProps) {
  const [key, setKey] = useState(0);
  const noMultipeVersions = (snaps || []).concat(tags).length < 2;

  if (noMultipeVersions) {
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
        <VersionMenu
          key={key}
          tags={tags}
          snaps={snaps || []}
          lanes={lanes || []}
          currentVersion={currentVersion}
          latestVersion={latestVersion}
          localVersion={localVersion}
        ></VersionMenu>
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
  tags: DropdownComponentVersion[];
  snaps: DropdownComponentVersion[];
  lanes: LaneModel[];
  localVersion?: boolean;
  currentVersion?: string;
  latestVersion?: string;
} & React.HTMLAttributes<HTMLDivElement>;

const VERSION_TAB_NAMES: Array<'TAG' | 'SNAP' | 'LANE'> = ['TAG', 'SNAP', 'LANE'];

function VersionMenu({ tags, snaps, lanes, currentVersion, localVersion, latestVersion, ...rest }: VersionMenuProps) {
  const [activeTabIndex, setActiveTab] = useState(0);

  const tabs = VERSION_TAB_NAMES.map((name) => {
    switch (name) {
      case 'SNAP':
        return { name, payload: snaps };
      case 'LANE':
        return { name, payload: lanes };
      default:
        return { name, payload: tags };
    }
  }).filter((tab) => tab.payload.length > 0);

  const activeTab = useMemo(() => tabs.find((_, index) => index === activeTabIndex), [activeTabIndex, tabs]);

  return (
    <div {...rest}>
      <div className={styles.top}>
        <div className={styles.title}>
          <span>Switch to tag or snap</span>
        </div>
        {localVersion && (
          <NavLink
            href={'?'}
            className={classNames(
              styles.versionLine,
              styles.versionRow,
              currentVersion === 'workspace' && styles.currentVersion
            )}
          >
            <div className={styles.version}>
              <UserAvatar size={20} account={{}} className={styles.versionUserAvatar} />
              <span className={styles.versionName}>workspace</span>
            </div>
          </NavLink>
        )}
      </div>
      <div className={styles.tabs}>
        {tabs.map(({ name }, index) => {
          return (
            <Tab
              className={styles.tab}
              key={index}
              isActive={activeTabIndex === index}
              onClick={() => setActiveTab(index)}
            >
              {name}
            </Tab>
          );
        })}
      </div>
      <div className={styles.versionContainer}>
        {activeTab?.name === 'LANE'
          ? activeTab?.payload.map((payload) => <LaneInfo key={payload.id} {...payload}></LaneInfo>)
          : activeTab?.payload.map((payload) => (
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

type VersionInfoProps = DropdownComponentVersion & {
  currentVersion?: string;
  latestVersion?: string;
};

function VersionInfo({ version, currentVersion, latestVersion, date, username, email }: VersionInfoProps) {
  const isCurrent = version === currentVersion;
  const author = useMemo(() => {
    return {
      displayName: username,
      email,
    };
  }, [version]);

  const timestamp = useMemo(() => (date ? new Date(parseInt(date)).toString() : new Date().toString()), [date]);

  return (
    <div key={version}>
      <NavLink
        href={version === LOCAL_VERSION ? '?' : `?version=${version}`}
        className={classNames(styles.versionLine, styles.versionRow, isCurrent && styles.currentVersion)}
      >
        <div className={styles.version}>
          <UserAvatar size={20} account={author} className={styles.versionUserAvatar} />
          <Ellipsis className={styles.versionName}>{version}</Ellipsis>
          {version === latestVersion && <VersionLabel className={styles.label} status="latest" />}
        </div>
        <TimeAgo className={styles.versionTimestamp} date={timestamp} />
      </NavLink>
    </div>
  );
}

type LaneInfoProps = LaneModel;

function LaneInfo({ id, url }: LaneInfoProps) {
  return (
    <div key={id}>
      <NavLink href={url} className={classNames(styles.versionLine, styles.versionRow)}>
        <span>
          <Icon className={styles.laneIcon} of="lane"></Icon>
          {id}
        </span>
      </NavLink>
    </div>
  );
}
