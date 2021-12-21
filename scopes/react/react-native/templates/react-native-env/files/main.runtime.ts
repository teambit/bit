import { ComponentContext } from '@teambit/generator';

export function mainRuntimeFile({ namePascalCase: Name, name }: ComponentContext) {
  return `import { MainRuntime } from '@teambit/cli';
  import { ReactNativeAspect, ReactNativeMain } from '@teambit/react-native';
import { EnvsAspect, EnvsMain } from '@teambit/envs';
import { ${Name}Aspect } from './${name}.aspect';
// import { previewConfigTransformer, devServerConfigTransformer } from './webpack/webpack-transformers';

/**
 * Uncomment to include config files for overrides of Typescript or Webpack
 */
// const tsconfig = require('./typescript/tsconfig');

export class ${Name}Main {
  static slots = [];

  static dependencies = [ReactNativeAspect, EnvsAspect];

  static runtime = MainRuntime;

  static async provider([reactNative, envs]: [ReactNativeMain, EnvsMain]) {
    const templatesReactNativeEnv = envs.compose(reactNative.reactNativeEnv, [
      /**
       * Uncomment to override the config files for TypeScript, Webpack or Jest
       * Your config gets merged with the defaults
       */

      // reactNative.overrideTsConfig(tsconfig),
      // reactNative.useWebpack({
      //   previewConfig: [previewConfigTransformer],
      //   devServerConfig: [devServerConfigTransformer],
      // }),
      // reactNative.overrideJestConfig(require.resolve('./jest/jest.config')),

      /**
       * override the ESLint default config here then check your files for lint errors
       * @example
       * bit lint
       * bit lint --fix
       */
       reactNative.useEslint({
        transformers: [
          (config) => {
            config.setRule('no-console', ['error']);
            return config;
          }
        ]
      }),

      /**
       * override the Prettier default config here the check your formatting
       * @example
       * bit format --check
       * bit format
       */
       reactNative.usePrettier({
        transformers: [
          (config) => {
            config.setKey('tabWidth', 2);
            return config;
          }
        ]
      }),

      /**
       * override dependencies here
       * @example
       * Uncomment types to include version 17.0.3 of the types package
       */
       reactNative.overrideDependencies({
        devDependencies: {
          // '@types/react': '17.0.3'
        }
      })
    ]);
    envs.registerEnv(templatesReactNativeEnv);
    return new ${Name}Main();
  }
}

${Name}Aspect.addRuntime(${Name}Main);
`;
}
