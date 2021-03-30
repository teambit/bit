import { GeneratorContext } from '@teambit/generator/component-template';

export const mainRuntime = ({ componentName, componentNameCamelCase }: GeneratorContext) => ({
  relativePath: `${componentName}.main.runtime.ts`,
  content: `import { MainRuntime } from '@teambit/cli';
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
`,
});
