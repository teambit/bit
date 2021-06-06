export const MainFileClass = ({ name, namePascalCase: Name, moduleName }) => {
  return `
    // e.g. const tsconfig = require.resolve(./ts/ts.config);

    export class ${moduleName} {
      static slots = [];
      static dependencies = [ReactAspect, EnvsAspect];
      static runtime = MainRuntime;
      static async provider([react, envs]: [ReactMain, EnvsMain])  {
        const ${Name}Env = envs.compose(react.reactEnv, [
          // e.g. react.overrideTsConfig(tsconfig) // tsconfig required above

        // Add overrides here via envs API functions as in the above example
      ]);
      envs.registerEnv(${Name}Env);
      return new ${moduleName}();
    }
  }
`;
};
