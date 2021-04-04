import { GeneratorContext } from '@teambit/generator';

export function extensionFile({ componentNameCamelCase: Name }: GeneratorContext) {
  return `
import { EnvsMain, EnvsAspect } from '@teambit/envs';
import { ReactAspect, ReactMain } from '@teambit/react';

// Example for fetching config from a file. The 'typescript' folder here is a directory inside your extended environment component
//const tsconfig = require('./typescript/tsconfig.json');

export class ${Name}Extension {
  constructor(private react: ReactMain) {}

  static dependencies: any = [EnvsAspect, ReactAspect];

  static async provider([envs, react]: [EnvsMain, ReactMain]) {
    const ${Name}Env = react.compose([
      /*
        Use any of the "react.override..." transformers to customize your environment
        e.g. 
        react.overrideTsConfig(tsconfig) // where the tsconfig parameter is defined above
      */
    ]);

    envs.registerEnv(${Name}Env);

    return new ${Name}Extension(react);
  }
}
`;
}
