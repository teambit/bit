import { MainRuntime } from '@teambit/cli';

import { PanelUiAspect } from './panel-ui.aspect';

export class PanelUIMain {
  static runtime: any = MainRuntime;
  static dependencies: any = [];

  static async provider() {
    return new PanelUIMain();
  }
}

PanelUiAspect.addRuntime(PanelUIMain);
