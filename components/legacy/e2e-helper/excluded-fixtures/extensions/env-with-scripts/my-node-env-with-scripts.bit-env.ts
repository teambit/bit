// @bit-no-check
// @ts-nocheck
import { NodeEnv } from '@teambit/node.node';
import { Scripts } from '@teambit/scripts';

export class MyNodeEnvWithScripts extends NodeEnv {
  /**
   * name of the environment. used for friendly mentions across bit.
   */
  name = 'my-node-env-with-scripts';

  /**
   * define custom scripts for this environment
   */
  scripts() {
    return Scripts.from({
      'test-script': 'echo hello from script',
      'another-script': 'echo another output',
      'async-script': async () => {
        return new Promise((resolve) => {
          setTimeout(() => {
            console.log('async script executed');
            resolve();
          }, 100);
        });
      },
    });
  }
}

export default new MyNodeEnvWithScripts();
