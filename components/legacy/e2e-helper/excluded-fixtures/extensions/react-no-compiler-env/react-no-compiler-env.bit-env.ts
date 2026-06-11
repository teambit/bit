// @bit-no-check
// @ts-nocheck
import { ReactEnv } from '@teambit/react.react-env';

/**
 * an env that has a preview/bundler but no compiler. it reproduces the (rare) scenario of an env
 * without a compiler that still needs to generate a preview during `bit build` (e.g.
 * bitdev.general/envs/js-env).
 *
 * it extends the react env (to inherit a working preview/bundler) and removes the compiler and the
 * build pipeline: `compiler` is unset so no `getCompiler` is exposed on the env, and `build` is
 * unset so the env contributes no build tasks (in particular no compiler task). the global preview
 * tasks still run, so the preview is generated for a component on this compiler-less env.
 */
export class ReactNoCompilerEnv extends ReactEnv {
  name = 'react-no-compiler-env';

  icon = 'https://static.bit.dev/extensions-icons/react.svg';

  compiler = undefined;

  build = undefined;
}

export default new ReactNoCompilerEnv();
