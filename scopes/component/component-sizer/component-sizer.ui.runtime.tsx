import { ComponentAspect } from '@teambit/component';
import { UIRuntime } from '@teambit/ui';
import { DocsAspect } from '@teambit/docs';
import { ComponentSizerAspect } from './component-sizer.aspect';

/**
 * Component code tab aspect. Presents the code tab page and allows to control the code tab and register specific icons for each file type.
 *  @example CodeUI.registerEnvFileIcon([(fileName) => (/your-regexp/.test(fileName) ? 'your.icon.url' : undefined)])
 */
export class SizerUIRuntime {
  static dependencies = [ComponentAspect, DocsAspect];

  static runtime = UIRuntime;

  static async provider() {
    const ui = new SizerUIRuntime();
    return ui;
  }
}

ComponentSizerAspect.addRuntime(SizerUIRuntime);
