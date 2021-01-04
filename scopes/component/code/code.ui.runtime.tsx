import { ComponentAspect, ComponentUI } from '@teambit/component';
import { UIRuntime } from '@teambit/ui';

import { CodeAspect } from './code.aspect';
import { CodeSection } from './code.section';

export class CodeUI {
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
