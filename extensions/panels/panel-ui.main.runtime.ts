import { MainRuntime } from '@teambit/cli';

import { PanelUiAspect } from './panel-ui.aspect';

export class PanelUIMain {
  static runtime = MainRuntime;
  static dependencies = [];

  static async provider() {
    return new PanelUIMain();
  }
}

PanelUiAspect.addRuntime(PanelUIMain);
