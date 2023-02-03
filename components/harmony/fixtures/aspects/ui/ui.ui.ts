import { UIAspect, UIRuntime } from './ui.aspect';

export class UiUI {
  static runtime = UIRuntime;

  static async provider() {
    return new UiUI();
  }
}

UIAspect.addRuntime(UiUI);
