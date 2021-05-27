export const MainFileContents = ({ name, namePascalCase: Name }) => {
  return `import { MainRuntime } from '@teambit/cli';
    import { EnvsAspect, EnvsMain } from '@teambit/envs';
    import { ReactAspect, ReactMain } from '@teambit/react';
    import { ${Name} } from './${name}.aspect';

    // e.g. const tsconfig = require.resolve(./ts/ts.config);

    export class ${Name}Main {
      static slots = [];
      static dependencies = [ReactAspect, EnvsAspect];
      static runtime = MainRuntime;
      static async provider([react, envs]: [ReactMain, EnvsMain])  {
        const ${Name}Env = envs.compose(react.reactEnv, [
          // e.g. react.overrideTsConfig(tsconfig) // tsconfig required above

        // Add overrides here via envs API functions as in the above example
      ]);
      envs.registerEnv(${Name}Env);
      return new ${Name}Main();
    }
  }
  ${Name}.addRuntime(${Name}Main);
`;
};
