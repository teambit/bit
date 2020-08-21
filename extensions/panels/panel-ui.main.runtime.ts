import { PanelUiAspect } from './panel-ui.aspect';
import { MainRuntime } from '@teambit/cli';

export class PanelUIMain {
  static runtime = MainRuntime;
  static dependencies = [];

  static async provider() {
    return new PanelUIMain();
  }
}

PanelUiAspect.addRuntime(PanelUIMain);
