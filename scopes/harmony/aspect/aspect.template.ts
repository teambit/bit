import { ComponentTemplate, GeneratorContext } from '@teambit/generator/component-template';

export const componentTemplates: ComponentTemplate[] = [
  {
    name: 'aspect',
    generateFiles: (context: GeneratorContext) => {
      const { componentName, componentNameCamelCase, componentId } = context;
      const mainRuntime = {
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
      };
      const aspectFile = {
        relativePath: `${componentName}.aspect.ts`,
        content: `import { Aspect } from '@teambit/harmony';

export const ${componentNameCamelCase}Aspect = Aspect.create({
  id: '${componentId}',
});
`,
      };
      const indexFile = {
        relativePath: 'index.ts',
        content: `import { ${componentNameCamelCase}Aspect } from './${componentName}.aspect';

export type { ${componentNameCamelCase}Main } from './${componentName}.main.runtime';
export default ${componentNameCamelCase}Aspect;
export { ${componentNameCamelCase}Aspect };`,
        isMain: true,
      };
      return [mainRuntime, aspectFile, indexFile];
    },
  },
];
