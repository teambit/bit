import React from 'react';

import { versionsArray } from './ui/changelog.data';
import { ChangeLogPage } from './ui/change-log-page';
import { ComponentUI } from '../component/component.ui';
import { Section } from '../component/section';
import styles from './changelog.module.scss';

export class ChangeLogUI {
  static dependencies = [ComponentUI];

  ChangeLog = () => {
    return <ChangeLogPage className={styles.changeLog} versions={versionsArray} />;
  };

  static async provider([component]: [ComponentUI]) {
    const ui = new ChangeLogUI();
    const section = new ChangelogSection();

    component.registerRoute(section.route);
    component.registerNavigation(section.navigationLink);

    return ui;
  }
}

class ChangelogSection implements Section {
  route = {
    path: '~changelog',
    children: <ChangeLogPage className={styles.changeLog} versions={versionsArray} />
  };
  navigationLink = {
    to: '~changelog',
    children: 'Changelog'
  };
}
