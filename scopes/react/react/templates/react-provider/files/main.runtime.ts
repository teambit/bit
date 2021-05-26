import { ComponentContext } from '@teambit/generator';

export const mainRuntimeFile = (context: ComponentContext) => {
  const { name, namePascalCase: Name } = context;
  return {
    relativePath: `${name}.main.runtime.tsx`,
    content: `import { MainRuntime } from '@teambit/cli';
import { EnvsAspect, EnvsMain } from '@teambit/envs';
import { ReactAspect, ReactMain } from '@teambit/react';
import { ${Name} } from './${name}.aspect';

export class ${Name}Main {
  static slots = [];
  static dependencies = [ReactAspect, EnvsAspect];
  static runtime = MainRuntime;
  static async provider([react, envs]: [ReactMain, EnvsMain])  {
    return new ${Name}Main();
  }
}

${Name}.addRuntime(${Name}Main);
`,
  };
};
