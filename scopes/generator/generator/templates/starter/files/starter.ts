import type { ComponentContext } from '../../../component-template';

export function starterFile({ namePascalCase, name }: ComponentContext) {
  return `import { WorkspaceContext, WorkspaceTemplate } from '@teambit/generator';
  import { generateFiles as generateCommonFiles } from './template/files/generate-files';

  export type ${namePascalCase}StarterOptions = Pick<WorkspaceTemplate, 'name' | 'description' | 'hidden'>;

  export class ${namePascalCase}WorkspaceStarter implements WorkspaceTemplate {
    constructor(
      readonly name = '${name}-workspace',
      readonly description = '${namePascalCase} workspace with a custom react env',
      readonly hidden = false
    ) {}

    async generateFiles(context: WorkspaceContext) {
      return generateCommonFiles(context);
    }

    fork() {
      return [
        {
          id: 'teambit.react/react-env-extension',
          targetName: 'envs/my-react-env',
        },
      ];
    }

    static from(options: Partial<${namePascalCase}StarterOptions>) {
      return () =>
        new ${namePascalCase}WorkspaceStarter(
          options.name,
          options.description,
          options.hidden
        );
    }
  }

`;
}
