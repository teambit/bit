import { ComponentAspect, ComponentUI } from '@teambit/component';
import { UIRuntime } from '@teambit/ui';
import { Harmony } from '@teambit/harmony';
import React from 'react';

import { ChangelogAspect } from './changelog.aspect';
import { ChangelogSection } from './changelog.section';
import { ChangeLogPage } from './ui/change-log-page';

export class ChangeLogUI {
  constructor(private host: string) {}
  ChangeLog = () => {
    return <ChangeLogPage host={this.host} />;
  };

  static dependencies = [ComponentAspect];

  static runtime = UIRuntime;

  static async provider([component]: [ComponentUI], _, __, harmony: Harmony) {
    const { config } = harmony;
    const host = String(config.get('teambit.harmony/bit'));
    const ui = new ChangeLogUI(host);
    const section = new ChangelogSection(host);

    component.registerRoute(section.route);
    component.registerWidget(section.navigationLink, section.order);

    return ui;
  }
}

ChangelogAspect.addRuntime(ChangeLogUI);
