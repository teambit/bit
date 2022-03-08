import { ComponentContext } from '@teambit/generator';

export function mainRuntimeFile({ name, namePascalCase }: ComponentContext) {
  return `import { MainRuntime } from '@teambit/cli';
import { CompilerAspect, CompilerMain } from '@teambit/compiler';
import { ${namePascalCase} } from './${name}.compiler';
import { ${namePascalCase}Aspect } from './${name}.aspect';

export class ${namePascalCase}Main {
  constructor(private compiler: CompilerMain) {}

  static slots = [];
  static dependencies = [CompilerAspect];
  static runtime = MainRuntime;

  distDir = 'dist';

  /* Set the main property of the component's package with
  the relative output path for the main file */
  getPackageJsonProps() {
    return {
      main: '\${this.distDir}/{main}.js',
    };
  }

  createCompiler(): ${namePascalCase} {
    return new ${namePascalCase}(${namePascalCase}Aspect.id, this.distDir, this.compiler);
  }

  static async provider([compiler]: [CompilerMain]) {
    return new ${namePascalCase}Main(compiler);
  }
}

${namePascalCase}Aspect.addRuntime(${namePascalCase}Main);
`;
}
