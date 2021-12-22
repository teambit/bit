import { ComponentAspect, ComponentUI } from '@teambit/component';
import { UIRuntime } from '@teambit/ui';
import React from 'react';
import { SlotRegistry, Slot } from '@teambit/harmony';
import type { FileIconMatch } from '@teambit/code.ui.utils.get-file-icon';
import { staticStorageUrl } from '@teambit/base-ui.constants.storage';
import { CodeStatsSection } from './code-stats.section';
import CodeStatsAspect from './code-stats.aspect';
import { CodeStatsPage } from '@teambit/code-stats-tab-page';

export class CodeStatsUI {
  constructor() {}
  getCodeStatsPage = () => {
    return <CodeStatsPage />;
  };
  static dependencies = [ComponentAspect];

  static runtime = UIRuntime;

  static slots = [Slot.withType<string>()];

  static async provider([component]: [ComponentUI], config) {
    const ui = new CodeStatsUI();
    const section = new CodeStatsSection(ui);

    component.registerRoute(section.route);
    component.registerWidget(section.navigationLink, section.order);
    return ui;
  }
}

CodeStatsAspect.addRuntime(CodeStatsUI);
