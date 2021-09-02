import { ComponentContext } from '@teambit/generator';

export function previewRuntimeFile({ namePascalCase: Name, nameCamelCase: nameCamel, name }: ComponentContext) {
  return `import { PreviewRuntime } from '@teambit/preview';
import { ReactAspect, ReactPreview } from '@teambit/react';
// uncomment the line below and install the theme if you want to use our theme or create your own and import it here
// import { ThemeCompositions } from '@teambit/documenter.theme.theme-compositions';

import { ${Name}Aspect } from './${name}.aspect';

export class ${Name}PreviewMain {
  static runtime = PreviewRuntime;

  static dependencies = [ReactAspect];

  static async provider([react]: [ReactPreview]) {
    const ${nameCamel}PreviewMain = new ${Name}PreviewMain();
    // uncomment the line below to register a new provider to wrap all compositions using this environment with a custom theme.
    // react.registerProvider([ThemeCompositions]);

    return ${nameCamel}PreviewMain;
  }
}

${Name}Aspect.addRuntime(${Name}PreviewMain);
`;
}
