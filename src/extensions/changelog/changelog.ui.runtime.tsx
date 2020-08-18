import React from 'react';
import { ChangeLogPage } from './ui/change-log-page';
import { ComponentUI } from '../component/component.ui.runtime';
import { ChangelogSection } from './changelog.section';

export class ChangeLogUI {
  static id = '@teambit/changelog';
  static dependencies = [ComponentUI];

  ChangeLog = () => {
    return <ChangeLogPage />;
  };

  static async provider([component]: [ComponentUI]) {
    const ui = new ChangeLogUI();
    const section = new ChangelogSection();

    component.registerRoute(section.route);
    component.registerNavigation(section.navigationLink);

    return ui;
  }
}

export default ChangeLogUI;
