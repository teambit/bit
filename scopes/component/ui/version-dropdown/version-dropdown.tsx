import { Icon } from '@teambit/evangelist.elements.icon';
import { NavLink } from '@teambit/base-ui.routing.nav-link';
import { Dropdown } from '@teambit/evangelist.surfaces.dropdown';
// import { Contributors } from '@teambit/design.ui.contributors';
import { VersionLabel } from '@teambit/component.ui.version-label';
import { Ellipsis } from '@teambit/design.ui.styles.ellipsis';
import { Tab } from '@teambit/ui-foundation.ui.use-box.tab';
import { LegacyComponentLog } from '@teambit/legacy-component-log';
import classNames from 'classnames';
import React, { useState, useMemo } from 'react';

import styles from './version-dropdown.module.scss';

const LOCAL_VERSION = 'workspace';

export type VersionDropdownVersion = Partial<LegacyComponentLog> & { version: string };

export type VersionDropdownProps = {
  tags: VersionDropdownVersion[];
  snaps?: VersionDropdownVersion[];
  currentVersion?: string;
  latestVersion?: string;
} & React.HTMLAttributes<HTMLDivElement>;

export function VersionDropdown({ snaps, tags, currentVersion, latestVersion }: VersionDropdownProps) {
  const [key, setKey] = useState(0);

  if ((snaps || []).concat(tags).length < 2) {
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
          currentVersion={currentVersion}
          latestVersion={latestVersion}
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
  tags: VersionDropdownVersion[];
  snaps: VersionDropdownVersion[];
  currentVersion?: string;
  latestVersion?: string;
} & React.HTMLAttributes<HTMLDivElement>;

const VERSION_TAB_NAMES: Array<'TAG' | 'SNAP'> = ['TAG', 'SNAP'];

function VersionMenu({ tags, snaps, currentVersion, latestVersion, ...rest }: VersionMenuProps) {
  const [activeTab, setActiveTab] = useState(0);
  const tabs = VERSION_TAB_NAMES.map((name) => {
    switch (name) {
      case 'SNAP':
        return { name, payload: snaps };
      default:
        return { name, payload: tags };
    }
  }).filter((tab) => tab.payload.length > 0);
  const activeVersions = useMemo(() => tabs.find((_, index) => index === activeTab), [activeTab, tabs]);
  return (
    <div {...rest}>
      <div className={styles.top}>
        <div className={styles.title}>
          <span>Switch to tag, lane or snap</span>
        </div>
      </div>
      <div className={styles.tabs}>
        {tabs.map(({ name }, index) => {
          return (
            <Tab key={index} isActive={activeTab === index} onClick={() => setActiveTab(index)}>
              {name}
            </Tab>
          );
        })}
      </div>
      <div className={styles.versionContainer}>
        {activeVersions?.payload.map(({ version }, index) => {
          const isCurrent = version === currentVersion;
          // const author = useMemo(() => {
          //   return {
          //     displayName: username,
          //     email,
          //   };
          // }, [version]);
          // const timestamp = useMemo(() => (date ? new Date(parseInt(date)).toString() : new Date().toString()), [date]);

          return (
            <NavLink
              href={version === LOCAL_VERSION ? '?' : `?version=${version}`}
              key={index}
              className={classNames(styles.versionLine, isCurrent && styles.currentVersion)}
            >
              <Ellipsis>
                <span className={styles.version}>{version}</span>
              </Ellipsis>
              {version === latestVersion && <VersionLabel className={styles.label} status="latest" />}
              {/* <Contributors contributors={[author || {}]} timestamp={timestamp} /> */}
            </NavLink>
          );
        })}
      </div>
    </div>
  );
}
