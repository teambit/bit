import { PanelUiAspect } from './panel-ui.aspect';
import { MainRuntime } from '../cli';

export class PanelUIMain {
  static runtime = MainRuntime;
  static dependencies = [];

  static async provider() {
    return new PanelUIMain();
  }
}

PanelUiAspect.addRuntime(PanelUIMain);
