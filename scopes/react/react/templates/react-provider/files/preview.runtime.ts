import { ComponentContext } from '@teambit/generator';

export const previewRuntimeFile = (context: ComponentContext) => {
  const { name, namePascalCase: Name } = context;

  return {
    relativePath: `${name}.preview.runtime.tsx`,
    content: `import React from 'react';
import { PreviewRuntime } from '@teambit/preview';
import { ${Name}, ${Name}Config } from './${name}.aspect';
import { ReactAspect, ReactPreview } from '@teambit/react';
import { Theme } from '@teambit/base-ui.theme.theme-provider';

export class ${Name}Preview {

    constructor(private config: ${Name}Config) {

    }
  static slots = [];
  static dependencies = [ReactAspect];
  static runtime = PreviewRuntime;
  static async provider([react]: [ReactPreview], config: ${Name}Config) {
      const ${name}ProviderPreview = new ${Name}ProviderPreview(config);

    // register a new provider to wrap all compositions in the ${name} environment.
    // You can register any number of providers, all of which will be wrapped around your
    react.registerProvider([
        ({ children }) => {
          return <div  style={{backgroundColor: "red"}}>{children}</ div> // will set bg color for all compositions to red
        },
        Theme as any // wraps all compositions in a theme component
      ]);


    return ${name}Preview;
  }
}

${Name}.addRuntime(${Name}Preview);
`,
  };
};
