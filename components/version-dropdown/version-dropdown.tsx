// import { Icon } from '@teambit/evangelist.elements.icon';
// import { Dropdown } from '@teambit/evangelist.surfaces.dropdown';
import { PillLabel } from '@teambit/staged-components.pill-label';
// import { VersionLabel } from '@teambit/staged-components.workspace-sections.version-label';
// import { hoverable } from 'bit-bin/dist/to-eject/css-components/hoverable';
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
        <PillLabel className={styles.label}>{currentVersion}</PillLabel>
      </div>
    );
  }
  return (
    <div className={styles.versionDropdown}>
      {/* <Dropdown
        className={styles.dropdown}
        dropClass={styles.menu}
        placeholder=""
        clickToggles
        clickOutside
        PlaceholderComponent={() => ( */}
      <div>
        {/* <div className={styles.overlay} /> */}
        <VersionPlaceholder currentVersion={currentVersion} />
      </div>
      {/* )}
      >
        <div>
          <div className={styles.title}>Select version to view</div>
          <div className={styles.versionContainer}>
            {versions.map((version, index) => {
              return (
                <div key={index} className={classNames(styles.versionLine, hoverable)}>
                  <span className={styles.version}>{version}</span>
                  {version === currentVersion && <VersionLabel status="latest" />}
                </div>
              );
            })}
          </div>
        </div>
      </Dropdown> */}
    </div>
  );
}

function VersionPlaceholder({ currentVersion }: { currentVersion?: string }) {
  return (
    <div className={classNames(styles.placeholder)}>
      <div>{currentVersion}</div>
      {/* <Icon of="fat-arrow-down" /> */}
    </div>
  );
}
