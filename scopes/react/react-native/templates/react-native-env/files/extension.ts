import { ComponentContext } from '@teambit/generator';

export function extensionFile({ namePascalCase: Name }: ComponentContext) {
  return `import { EnvsMain, EnvsAspect } from '@teambit/envs'
import { ReactNativeAspect, ReactNativeMain } from '@teambit/react-native'

export class ${Name}Extension {
  constructor(private reactNative: ReactNativeMain) {}

  static dependencies: any = [EnvsAspect, ReactNativeAspect]

  static async provider([envs, reactNative]: [EnvsMain, ReactNativeMain]) {
    const ${Name}Env = reactNative.compose([
      /*
        Use any of the "reactNative.override..." transformers to
      */
    ])

    envs.registerEnv(${Name}Env)

    return new ${Name}Extension(reactNative)
  }
}
`;
}
