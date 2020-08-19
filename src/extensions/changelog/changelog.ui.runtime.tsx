import React from 'react';
import { ChangeLogPage } from './ui/change-log-page';
import { ComponentUI, ComponentAspect } from '../component';
import { ChangelogSection } from './changelog.section';

export class ChangeLogUI {
  static id = '@teambit/changelog';
  static dependencies = [ComponentAspect];

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
