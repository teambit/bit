import { Icon } from '@teambit/evangelist.elements.icon';
import { NavLink } from 'react-router-dom';
import { Dropdown } from '@teambit/evangelist.surfaces.dropdown';
import { VersionLabel } from '@teambit/component.ui.version-label';
import { Ellipsis } from '@teambit/design.ui.styles.ellipsis';
import classNames from 'classnames';
import React from 'react';

import styles from './version-dropdown.module.scss';

type VersionDropdownProps = {
  versions: string[];
  currentVersion?: string;
} & React.HTMLAttributes<HTMLDivElement>;

export function VersionDropdown({ versions, currentVersion }: VersionDropdownProps) {
  if (versions.length < 2) {
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
        placeholder=""
        clickOutside
        PlaceholderComponent={() => (
          <VersionPlaceholder currentVersion={currentVersion} className={styles.withVersions} />
        )}
      >
        <div>
          <div className={styles.title}>Select version to view</div>
          <div className={styles.versionContainer}>
            {versions.map((version, index) => {
              const isCurrent = version === currentVersion;
              return (
                <NavLink
                  to={`?version=${version}`}
                  key={index}
                  className={classNames(styles.versionLine, isCurrent && styles.currentVersion)}
                >
                  <span className={styles.version}>{version}</span>
                  {index === 0 && <VersionLabel className={styles.label} status="latest" />}
                  {/* {version === currentVersion && <VersionLabel className={styles.label} status="checked-out" />} */}
                </NavLink>
              );
            })}
          </div>
        </div>
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
