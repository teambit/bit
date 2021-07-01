import { ComponentAspect, ComponentUI } from '@teambit/component';
import { UIRuntime } from '@teambit/ui';
import React from 'react';

import { ChangelogAspect } from './changelog.aspect';
import { ChangelogSection } from './changelog.section';
import { ChangeLogPage } from './ui/change-log-page';

export class ChangeLogUI {
  ChangeLog = () => {
    return <ChangeLogPage />;
  };

  static dependencies = [ComponentAspect];

  static runtime = UIRuntime;

  static async provider([component]: [ComponentUI]) {
    const ui = new ChangeLogUI();
    const section = new ChangelogSection();

    component.registerRoute(section.route);
    component.registerWidget(section.navigationLink, section.order);

    return ui;
  }
}

ChangelogAspect.addRuntime(ChangeLogUI);
