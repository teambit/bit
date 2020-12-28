import { ComponentAspect, ComponentUI } from '@teambit/component';
import { UIRuntime } from '@teambit/ui';
import React from 'react';

import { CodeAspect } from './code.aspect';
import { CodeSection } from './code.section';
import { CodePage } from './ui/code-tab-page';

export class CodeUI {
  Code = () => {
    return <CodePage />;
  };

  static dependencies = [ComponentAspect];

  static runtime = UIRuntime;

  static async provider([component]: [ComponentUI]) {
    const ui = new CodeUI();
    const section = new CodeSection();

    component.registerRoute(section.route);
    component.registerWidget(section.navigationLink, section.order);

    return ui;
  }
}

CodeAspect.addRuntime(CodeUI);
