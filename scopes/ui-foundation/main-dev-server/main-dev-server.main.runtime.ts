import { MainRuntime } from '@teambit/cli';
import PubsubAspect, { PubsubMain } from '@teambit/pubsub';
import type { UiMain } from '@teambit/ui';

import { MainDevServerAspect } from './main-dev-server.aspect';
import { startMainUiServer } from './start-main-ui-server';

export class MainDevServerMain {
  private ui: UiMain | null = null;
  constructor(private pubsub: PubsubMain) {}

  createServer(ui: UiMain) {
    this.ui = ui;
    return this;
  }

  run(
    uiRootName: string | undefined,
    pattern: string | undefined,
    dev: boolean | undefined,
    port: string | undefined,
    rebuild: boolean | undefined
  ) {
    if (!this.ui) {
      throw new Error('No UI Specified');
    }
    startMainUiServer(this.ui, this.pubsub, uiRootName, pattern, dev, port, rebuild);
  }

  static runtime = MainRuntime;

  static dependencies = [PubsubAspect];

  static async provider([pubsub]: [PubsubMain]) {
    return new MainDevServerMain(pubsub);
  }
}

MainDevServerAspect.addRuntime(MainDevServerMain);
