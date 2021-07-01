import { ComponentContext } from '@teambit/generator';

export function mainRuntime({ name, namePascalCase }: ComponentContext) {
  return `import { MainRuntime } from '@teambit/cli';
import { ${namePascalCase}Aspect } from './${name}.aspect';

export class ${namePascalCase}Main {
  static slots = [];
  static dependencies = [];
  static runtime = MainRuntime;
  static async provider() {
    return new ${namePascalCase}Main();
  }
}

${namePascalCase}Aspect.addRuntime(${namePascalCase}Main);
`;
}
