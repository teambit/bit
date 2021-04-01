import { GeneratorContext } from '@teambit/generator';

export function mainRuntime({ componentName, componentNameCamelCase }: GeneratorContext) {
  return `import { MainRuntime } from '@teambit/cli';
import { ${componentNameCamelCase}Aspect } from './${componentName}.aspect';

export class ${componentNameCamelCase}Main {
  static slots = [];
  static dependencies = [];
  static runtime = MainRuntime;
  static async provider() {
    return new ${componentNameCamelCase}Main();
  }
}

${componentNameCamelCase}Aspect.addRuntime(${componentNameCamelCase}Main);
`;
}
