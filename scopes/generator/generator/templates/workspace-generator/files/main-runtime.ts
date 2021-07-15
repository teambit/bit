import { ComponentContext } from '@teambit/generator';

export function mainRuntime({ name, namePascalCase }: ComponentContext) {
  return `import { MainRuntime } from '@teambit/cli';
import { GeneratorMain, GeneratorAspect, ComponentContext } from '@teambit/generator';
import { ${namePascalCase}Aspect } from './${name}.aspect';
import { workspaceTemplate } from './template';

export class ${namePascalCase}Main {
  static slots = [];
  static dependencies = [GeneratorAspect];
  static runtime = MainRuntime;
  static async provider([generator]: [GeneratorMain]) {
    generator.registerWorkspaceTemplate([workspaceTemplate]);
    return new ${namePascalCase}Main();
  }
}

${namePascalCase}Aspect.addRuntime(${namePascalCase}Main);
`;
}
