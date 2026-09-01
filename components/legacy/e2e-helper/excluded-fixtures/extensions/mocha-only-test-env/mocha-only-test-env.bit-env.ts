import { MochaTester, MochaTask } from '@teambit/defender.mocha-tester';
import { TypescriptCompiler, TypescriptTask } from '@teambit/typescript.typescript-compiler';
import { Pipeline } from '@teambit/builder';

const presets = [
  require.resolve('@babel/preset-typescript'),
  // force CommonJS output: the mocha tester loads spec files through @babel/register (a CommonJS
  // require hook), so ESM imports must be down-leveled to require(). since @babel/preset-env v8 the
  // default "modules: auto" preserves ESM, which makes Node treat the spec as ESM and fail to
  // resolve extension-less relative imports (e.g. "./foo").
  [require.resolve('@babel/preset-env'), { modules: 'commonjs' }]
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
