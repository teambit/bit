import { ComponentAspect, ComponentUI } from '@teambit/component';
import { UIRuntime } from '@teambit/ui';
import { Harmony } from '@teambit/harmony';
import { BuilderSection } from './builder.section';
import { BuilderUIAspect } from './builder-ui.aspect';

export class BuilderUI {
  static dependencies = [ComponentAspect];

  static runtime = UIRuntime;

  static async provider([component]: [ComponentUI], _, __, harmony: Harmony) {
    const ui = new BuilderUI();
    const { config } = harmony;
    const host = String(config.get('teambit.harmony/bit'));

    const section = new BuilderSection(host);

    component.registerRoute(section.route);
    component.registerNavigation(section.navigationLink, section.order);

    return ui;
  }
}

BuilderUIAspect.addRuntime(BuilderUI);
