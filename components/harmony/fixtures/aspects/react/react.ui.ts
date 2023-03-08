import ReactAspect from './react.aspect';
import { UIRuntime } from '../ui/ui.aspect';

export class ReactUI {
  static runtime = UIRuntime;

  render() {
    return 'rendering something!';
  }

  static async provider() {
    return new ReactUI();
  } 
}

ReactAspect.addRuntime(ReactUI);
