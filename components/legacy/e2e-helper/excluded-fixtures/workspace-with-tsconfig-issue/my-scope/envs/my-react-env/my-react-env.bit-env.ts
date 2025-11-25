// @bit-no-check
// @ts-nocheck

/**
 * this env extends react-env
 * @see https://bit.cloud/teambit/react/react-env
 */
import { ReactEnv } from '@teambit/react.react-env';

import { Compiler } from '@teambit/compiler';
import { EnvHandler } from '@teambit/envs';
import {
  TypescriptCompiler,
  resolveTypes,
} from '@teambit/typescript.typescript-compiler';

export class MyReactEnv extends ReactEnv {
  /* a shorthand name for the env */
  name = 'my-react-env';

  /* the compiler to use during development */
  compiler(): EnvHandler<Compiler> {
    /**
     * @see https://bit.dev/reference/typescript/using-typescript
     * */
    return TypescriptCompiler.from({
      tsconfig: require.resolve('./config/tsconfig.json'),
      types: resolveTypes(__dirname, ['./types']),
    });
  }
}

export default new MyReactEnv();
