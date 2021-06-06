import { ComponentContext } from '@teambit/generator';

export const previewRuntimeFile = (context: ComponentContext) => {
  const { name, namePascalCase: Name } = context;
  const functionName = Name + 'Preview';

  return {
    relativePath: `${name}.preview.runtime.tsx`,
    content: `import React from 'react';
import { PreviewRuntime } from '@teambit/preview';
import { ReactAspect, ReactPreview } from '@teambit/react';
import { Theme } from '@teambit/base-ui.theme.theme-provider'; // add your own theme component
import { ${Name}, ${Name}Config } from './${name}.aspect';

export class ${functionName} {

    constructor(private config: ${Name}Config) {

    }
  static slots = [];
  static dependencies = [ReactAspect];
  static runtime = PreviewRuntime;
  static async provider([react]: [ReactPreview], config: ${Name}Config) {
      const ${name}Preview = new ${functionName}(config);

    // register a new provider to wrap all compositions of components using the ${name} environment.
    // You can register any number of providers, all of which will be wrapped around each composition
    react.registerProvider([
        ({ children }) => {
          return <div  style={{backgroundColor: "red"}}>{children}</ div> // will set bg color for all compositions to red
        },
        // apply your own theme here
        Theme as any, // wraps all compositions in a theme component
      ]);


    return ${name}Preview;
  }
}

${Name}.addRuntime(${functionName});
`,
  };
};
