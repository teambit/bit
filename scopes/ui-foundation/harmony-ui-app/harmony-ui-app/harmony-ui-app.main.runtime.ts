import type { ApplicationMain } from '@teambit/application';
import { ApplicationAspect } from '@teambit/application';
import { MainRuntime } from '@teambit/cli';
import type { UiMain } from '@teambit/ui';
import { UIAspect } from '@teambit/ui';
import type { ComponentMain } from '@teambit/component';
import { ComponentAspect } from '@teambit/component';
import type { HarmonyAppOptions } from './harmony-app-options';
import { HarmonyUiAppAspect } from './harmony-ui-app.aspect';
// import { HarmonyUIApp } from './ui.application';

export class HarmonyUiAppMain {
  constructor(
    private application: ApplicationMain,
    private ui: UiMain,
    private componentAspect: ComponentMain
  ) {}

  /**
   * register a new harmony UI application.
   */
  registerHarmonyApp(options: HarmonyAppOptions) {
    this.ui.registerUiRoot({
      name: options.name,
      path: this.componentAspect.getHost().path,
      configFile: '',
      async resolvePattern() {
        return [];
      },
      async resolveAspects() {
        return options.aspectDefs;
      },
    });

    // this.application.registerApp(new HarmonyUIApp(options.name, this.ui));

    return this;
  }

  static slots = [];

  static dependencies = [ApplicationAspect, UIAspect, ComponentAspect];

  static runtime = MainRuntime;

  static async provider([application, ui, componentAspect]: [ApplicationMain, UiMain, ComponentMain]) {
    return new HarmonyUiAppMain(application, ui, componentAspect);
  }
}

HarmonyUiAppAspect.addRuntime(HarmonyUiAppMain);
