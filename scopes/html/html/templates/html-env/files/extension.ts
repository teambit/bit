import { ComponentContext } from '@teambit/generator';

export function extensionFile({ namePascalCase: Name }: ComponentContext) {
  return `import { EnvsMain, EnvsAspect } from '@teambit/envs'
import { HtmlAspect, HtmlMain } from '@teambit/html'

export class ${Name}Extension {
  constructor(private html: HtmlMain) {}

  static dependencies: any = [EnvsAspect, HtmlAspect]

  static async provider([envs, html]: [EnvsMain, HtmlMain]) {
    const ${Name}Env = html.compose([
      /*
        Use any of the "html.override..." transformers to
      */
    ])

    envs.registerEnv(${Name}Env)

    return new ${Name}Extension(html)
  }
}
`;
}
