import { GeneratorContext } from '@teambit/generator';

export function extensionFile({ componentNameCamelCase: Name }: GeneratorContext) {
  return `
import { EnvsMain, EnvsAspect } from '@teambit/envs';
import { NodeAspect, NodeMain } from '@teambit/node';

// Example for fetching config from a file. The 'typescript' folder here is a directory inside your extended environment component
//const tsconfig = require('./typescript/tsconfig.json');

export class ${Name}Extension {
  constructor(private node: NodeMain) {}

  static dependencies: any = [EnvsAspect, NodeAspect];

  static async provider([envs, node]: [EnvsMain, NodeMain]) {
    const ${Name}Env = node.compose([
      /*
        Use any of the "node.override..." transformers to customize your environment
        e.g. 
        node.overrideTsConfig(tsconfig) // where the tsconfig parameter is defined above
      */
    ]);

    envs.registerEnv(${Name}Env);

    return new ${Name}Extension(node);
  }
}
`;
}
