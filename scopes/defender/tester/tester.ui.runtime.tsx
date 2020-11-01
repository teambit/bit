import { UIRuntime } from '@teambit/ui';
import { ComponentAspect, ComponentUI } from '@teambit/component';
import { TestsSection } from './tests.section';

import { TesterAspect } from './tester.aspect';

export class TesterUI {
  static dependencies = [ComponentAspect];

  static runtime = UIRuntime;

  stageKey?: string;

  constructor(private component: ComponentUI) {}

  static async provider([component]: [ComponentUI]) {
    const testerUi = new TesterUI(component);

    const section = new TestsSection();

    component.registerRoute(section.route);
    component.registerNavigation(section.navigationLink, section.order);

    return testerUi;
  }
}

export default TesterUI;

TesterAspect.addRuntime(TesterUI);
