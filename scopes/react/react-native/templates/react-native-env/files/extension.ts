import { GeneratorContext } from '@teambit/generator';

export function extensionFile({ componentNameCamelCase: Name }: GeneratorContext) {
  return `
import { EnvsMain, EnvsAspect } from '@teambit/envs';
import { ReactNativeAspect, ReactNativeMain } from '@teambit/react-native';

// Example for fetching config from a file. The 'typescript' folder here is a directory inside your extended environment component
//const tsconfig = require('./typescript/tsconfig.json');


export class ${Name}Extension {
  constructor(private reactNative: ReactNativeMain) {}

  static dependencies: any = [EnvsAspect, ReactNativeAspect];

  static async provider([envs, reactNative]: [EnvsMain, ReactNativeMain]) {
    const ${Name}Env = reactNative.compose([
      /*
        Use any of the "reactNative.override..." transformers to customize your environment
        e.g. 
        reactNative.overrideTsConfig(tsconfig) // where the tsconfig parameter is defined above
      */
    ]);

    envs.registerEnv(${Name}Env);

    return new ${Name}Extension(reactNative);
  }
}
`;
}
