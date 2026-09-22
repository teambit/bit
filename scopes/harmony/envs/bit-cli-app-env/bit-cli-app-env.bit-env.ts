import { CoreAspectEnv } from '@teambit/harmony.envs.core-aspect-env';
import type { Pipeline } from '@teambit/builder';
import { BundleCliAppTask } from './bundle-cli-app.task';

/**
 * The env of `teambit.harmony/bit` - the CLI application itself.
 *
 * Every other component in this repo is a library that happens to be an aspect, and
 * `core-aspect-env` is right for those. `@teambit/bit` is different: it is the *application*, and
 * its build has to produce a runnable, self-contained CLI rather than just a compiled package. This
 * env is that difference, and nothing more - it inherits the compiler, tester, linter, formatter,
 * schema extractor and packaging of `core-aspect-env` untouched, and only appends to the build
 * pipeline.
 */
export class BitCliAppEnv extends CoreAspectEnv {
  name = 'bit-cli-app-env';

  icon = 'https://static.bit.dev/bit-logo.svg';

  /**
   * `super.build()` first, then the bundling task: the bundler reads every core aspect's compiled
   * `dist`, so it can only run once the compilers in the inherited pipeline have finished.
   */
  build(): Pipeline {
    return super.build().add([BundleCliAppTask.from()]);
  }
}

export default new BitCliAppEnv();
