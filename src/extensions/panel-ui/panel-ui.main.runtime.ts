import { PanelUiAspect } from './panel-ui.aspect';
import { MainRuntime } from '../cli/cli.aspect';
export class PanelUI {
  static runtime = MainRuntime;
  static dependencies = [];

  static async provider() {
    return new PanelUI();
  }
}

PanelUiAspect.addRuntime(PanelUiMain);
