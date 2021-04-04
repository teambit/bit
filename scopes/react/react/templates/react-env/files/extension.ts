import { GeneratorContext } from '@teambit/generator';

export function extensionFile({ namePascalCase: Name }: GeneratorContext) {
  return `import { EnvsMain, EnvsAspect } from '@teambit/envs'
import { ReactAspect, ReactMain } from '@teambit/react'

export class ${Name}Extension {
  constructor(private react: ReactMain) {}

  static dependencies: any = [EnvsAspect, ReactAspect]

  static async provider([envs, react]: [EnvsMain, ReactMain]) {
    const ${Name}Env = react.compose([
      /*
        Use any of the "react.override..." transformers to
      */
    ])

    envs.registerEnv(${Name}Env)

    return new ${Name}Extension(react)
  }
}
`;
}
