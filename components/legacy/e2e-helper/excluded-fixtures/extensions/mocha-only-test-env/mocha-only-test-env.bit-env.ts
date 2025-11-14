import { MochaTester, MochaTask } from '@teambit/defender.mocha-tester';
import { TypescriptCompiler, TypescriptTask } from '@teambit/typescript.typescript-compiler';
import { Pipeline } from '@teambit/builder';

const presets = [
  require.resolve('@babel/preset-typescript'),
  require.resolve('@babel/preset-env')
];

export class MochaOnlyTestEnv {
  name = 'mocha-only-test-env';

  compiler() {
    return TypescriptCompiler.from({
      tsconfig: require.resolve('./config/tsconfig.json')
    });
  }

  tester() {
    return MochaTester.from({
      babelTransformOptions: { presets }
    });
  }

  build() {
    return Pipeline.from([TypescriptTask.from({
      tsconfig: require.resolve('./config/tsconfig.json')
    }), MochaTask.from({
      babelTransformOptions: { presets }
    })]);
  }
}

export default new MochaOnlyTestEnv();
