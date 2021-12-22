import { ComponentContext } from '@teambit/generator';

export function previewRuntimeFile({ namePascalCase: Name, nameCamelCase: nameCamel, name }: ComponentContext) {
  return `import { PreviewRuntime } from '@teambit/preview';
import { ReactNativeAspect, ReactNativePreview } from '@teambit/react-native';
// create your theme and import it here
// import { ThemeCompositions } from '@my-company/my-scope.theme.theme-compositions';
import { ${Name}Aspect } from './${name}.aspect';

export class ${Name}PreviewMain {
  static runtime = PreviewRuntime;

  static dependencies = [ReactNativeAspect];

  static async provider([reactNative]: [ReactNativePreview]) {
    const ${nameCamel}PreviewMain = new ${Name}PreviewMain();
    // uncomment the line below to register a new provider to wrap all compositions using this environment with a custom theme.
    // reactNative.registerProvider([ThemeCompositions]);

    return ${nameCamel}PreviewMain;
  }
}

${Name}Aspect.addRuntime(${Name}PreviewMain);
`;
}
