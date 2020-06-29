import React from 'react';

import { versionsArray } from './ui/changelog.data';
import { ChangeLogPage } from './ui/change-log-page';
import { ComponentUI } from '../component/component.ui';
import styles from './changelog.module.scss';
import { ChangelogSection } from './changelog.section';

export class ChangeLogUI {
  static dependencies = [ComponentUI];

  ChangeLog = () => {
    return <ChangeLogPage versions={versionsArray} />;
  };

  static async provider([component]: [ComponentUI]) {
    const ui = new ChangeLogUI();
    const section = new ChangelogSection();

    component.registerRoute(section.route);
    component.registerNavigation(section.navigationLink);

    return ui;
  }
}
