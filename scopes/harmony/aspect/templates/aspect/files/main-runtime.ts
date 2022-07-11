import { ComponentContext } from '@teambit/generator';

export function mainRuntime({ name, namePascalCase }: ComponentContext) {
  return `import { MainRuntime } from '@teambit/cli';
import { ${namePascalCase}Aspect } from './${name}.aspect';

export class ${namePascalCase}Main {
  // your aspect API goes here.
  getSomething() {}

  static slots = [];
  // define your aspect dependencies here.
  // in case you need to use another aspect API.
  static dependencies = [];

  static runtime = MainRuntime;

  static async provider() {
    return new ${namePascalCase}Main();
  }
}

${namePascalCase}Aspect.addRuntime(${namePascalCase}Main);

export default ${namePascalCase}Main;
`;
}
