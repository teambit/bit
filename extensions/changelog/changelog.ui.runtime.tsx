import React from 'react';
import { ChangeLogPage } from './ui/change-log-page';
import { ComponentUI, ComponentAspect } from '@teambit/component';
import { ChangelogSection } from './changelog.section';
import { UIRuntime } from '@teambit/ui';
import { ChangelogAspect } from './changelog.aspect';

export class ChangeLogUI {
  static id = 'teambit.bit/changelog';
  static dependencies = [ComponentAspect];

  static runtime = UIRuntime;

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

ChangelogAspect.addRuntime(ChangeLogUI);
