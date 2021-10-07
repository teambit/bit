import { ComponentContext } from '@teambit/generator';

export function extensionFile({ namePascalCase: Name }: ComponentContext) {
  return `import { EnvsMain, EnvsAspect } from '@teambit/envs';
import { ReactNativeAspect, ReactNativeMain } from '@teambit/react-native';
// import { previewConfigTransformer, devServerConfigTransformer } from './webpack/webpack-transformers';

export class ${Name}Extension {
  constructor(private reactNative: ReactNativeMain) {}

  static dependencies: any = [EnvsAspect, ReactNativeAspect]

  static async provider([envs, reactNative]: [EnvsMain, ReactNativeMain]) {
    const ${Name}Env = reactNative.compose([
      /*
        Use any of the "reactNative.override..." transformers to
      */
      // reactNative.useWebpack({
      //   previewConfig: [previewConfigTransformer],
      //   devServerConfig: [devServerConfigTransformer],
      // }),
      // reactNative.overrideJestConfig(require.resolve('./jest/jest.config')),
    ])

    envs.registerEnv(${Name}Env)

    return new ${Name}Extension(reactNative)
  }
}
`;
}
