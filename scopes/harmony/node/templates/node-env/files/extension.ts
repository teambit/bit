import { ComponentContext } from '@teambit/generator';

export function extensionFile({ namePascalCase: Name }: ComponentContext) {
  return `import { EnvsMain, EnvsAspect } from '@teambit/envs'
import { NodeAspect, NodeMain } from '@teambit/node'

export class ${Name}Extension {
  constructor(private node: NodeMain) {}

  static dependencies: any = [EnvsAspect, NodeAspect]

  static async provider([envs, node]: [EnvsMain, NodeMain]) {
    const ${Name}Env = node.compose([
      /*
        Use any of the "node.override..." transformers to
      */
    ])

    envs.registerEnv(${Name}Env)

    return new ${Name}Extension(node)
  }
}
`;
}
