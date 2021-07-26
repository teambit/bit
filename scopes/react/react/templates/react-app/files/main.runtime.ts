import { ComponentContext } from '@teambit/generator';

export function mainRuntimeFile({ name, namePascalCase: Name }: ComponentContext) {
  return `import { MainRuntime } from '@teambit/cli';
import { ReactAspect, ReactMain } from '@teambit/react';
import { ${Name}Aspect } from './${name}.aspect';

export class ${Name}Main {
  static slots = [];
  static dependencies = [ReactAspect];
  static runtime = MainRuntime;
  static async provider([react]: [ReactMain]) {
    react.registerReactApp({
      name: '${name}',
      entry: ['dist/${name}.app-root']
    });
    return new ${Name}Main();
  }
}
${Name}Aspect.addRuntime(${Name}Main);
`;
}
