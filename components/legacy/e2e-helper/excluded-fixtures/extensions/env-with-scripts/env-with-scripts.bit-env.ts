// @bit-no-check
// @ts-nocheck
import { Scripts } from '@teambit/scripts';

export class EnvWithScripts {
  /**
   * name of the environment. used for friendly mentions across bit.
   */
  name = 'env-with-scripts';

  /**
   * define custom scripts for this environment
   */
  scripts() {
    return Scripts.from({
      'test-script': 'echo hello from script',
      'another-script': 'echo another output',
      'async-script': async (context) => {
        return new Promise((resolve) => {
          setTimeout(() => {
            console.log('async script executed');
            console.log(`executed for ${context?.components.length || 0} component(s)`);
            resolve();
          }, 100);
        });
      },
    });
  }
}

export default new EnvWithScripts();
