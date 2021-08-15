import { CompilerOptions, ModuleKind } from 'typescript';
import { TypeScriptCompilerOptions } from '@teambit/typescript';
import { TypescriptConfigMutator } from './ts-config-mutator';

class MyPlugin {
  apply() {}
}

const baseTypescriptConfig: TypeScriptCompilerOptions = {
  tsconfig: {
    compilerOptions: {},
    exclude: [],
  },
  types: [],
};

const simpleCompilerOptions: CompilerOptions = {
  module: ModuleKind.CommonJS,
};

describe('ts config mutator test', () => {
  it('add types', () => {
    const path = './typesPath1';
    const config = new TypescriptConfigMutator(baseTypescriptConfig);
    config.addTypes([path]);
    expect(config.raw.types).toContain(path);
  });

  it('set experimental decorators', () => {
    const config = new TypescriptConfigMutator(baseTypescriptConfig);
    config.setExperimentalDecorators(true);
    expect(config.raw.tsconfig.compilerOptions.experimentalDecorators).toEqual(true);
  });

  it('set target', () => {
    const config = new TypescriptConfigMutator(baseTypescriptConfig);
    config.setTarget('ES2015');
    expect(config.raw.tsconfig.compilerOptions.target).toEqual('ES2015');
  });

  it('add exclude', () => {
    const config = new TypescriptConfigMutator(baseTypescriptConfig);
    config.addExclude(['dist']);
    expect(config.raw.tsconfig.exclude[0]).toContain('dist');
  });
});

describe('ts config mutator combination', () => {
  it('add types and set target', () => {
    const path = './typesPath1';
    const config = new TypescriptConfigMutator(baseTypescriptConfig);
    config.addTypes([path]).setTarget('ES2015');
    expect(config.raw.types).toContain(path);
    expect(config.raw.tsconfig.compilerOptions.target).toEqual('ES2015');
  });
});
