import { expect } from 'chai';
import type * as Real from './contracts.real-types';
import type * as Contract from './index';

/**
 * the contract types are a narrow copy of the aspects' types. these assertions fail the type check
 * when they drift apart:
 * - what Bit passes to envs must be assignable to the contract type the env receives.
 * - what envs return to Bit must be assignable to the type Bit expects.
 */
type Assert<T extends true> = T;
type IsAssignable<From, To> = [From] extends [To] ? true : false;

// Bit passes these to envs.
export type BitToEnv = [
  Assert<IsAssignable<Real.EnvContext, Contract.EnvContext>>,
  Assert<IsAssignable<Real.ExecutionContext, Contract.ExecutionContext>>,
  Assert<IsAssignable<Real.Component, Contract.Component>>,
  Assert<IsAssignable<Real.ComponentMap<string>, Contract.ComponentMap<string>>>,
  Assert<IsAssignable<Real.Capsule, Contract.Capsule>>,
  Assert<IsAssignable<Real.Network, Contract.Network>>,
  Assert<IsAssignable<Real.BuildContext, Contract.BuildContext>>,
  Assert<IsAssignable<Real.TaskResultsList, Contract.TaskResultsList>>,
  Assert<IsAssignable<Real.TesterContext, Contract.TesterContext>>,
  Assert<IsAssignable<Real.LinterContext, Contract.LinterContext>>,
  Assert<IsAssignable<Real.FormatterContext, Contract.FormatterContext>>,
  Assert<IsAssignable<Real.ComponentContext, Contract.ComponentContext>>,
  Assert<IsAssignable<Real.WorkspaceContext, Contract.WorkspaceContext>>,
  Assert<IsAssignable<Real.BundlerContext, Contract.BundlerContext>>,
  Assert<IsAssignable<Real.DevServerContext, Contract.DevServerContext>>,
  Assert<IsAssignable<Real.AppContext, Contract.AppContext>>,
  Assert<IsAssignable<Real.AppBuildContext, Contract.AppBuildContext>>,
  Assert<IsAssignable<Real.AppDeployContext, Contract.AppDeployContext>>,
  Assert<IsAssignable<Real.RenderingContext, Contract.RenderingContext>>,
  Assert<IsAssignable<Real.DocsRootProps, Contract.DocsRootProps>>,
  // envs get these aspects from the env context.
  Assert<IsAssignable<Real.Workspace, Contract.Workspace>>,
  Assert<IsAssignable<Real.PubsubMain, Contract.PubsubMain>>,
  Assert<IsAssignable<Real.TypescriptMain, Contract.TypescriptSchemaProvider>>,
];

// envs return these to Bit.
export type EnvToBit = [
  Assert<IsAssignable<Contract.Compiler, Real.Compiler>>,
  Assert<IsAssignable<Contract.Tester, Real.Tester>>,
  Assert<IsAssignable<Contract.Linter, Real.Linter>>,
  Assert<IsAssignable<Contract.Formatter, Real.Formatter>>,
  Assert<IsAssignable<Contract.SchemaExtractor, Real.SchemaExtractor>>,
  Assert<IsAssignable<Contract.BuildTask, Real.BuildTask>>,
  Assert<IsAssignable<Contract.Pipeline, Real.Pipeline>>,
  Assert<IsAssignable<Contract.Tests, Real.Tests>>,
  Assert<IsAssignable<Contract.PackageGenerator, Real.PackageGenerator>>,
  Assert<IsAssignable<Contract.TemplateList, Real.TemplateList>>,
  Assert<IsAssignable<Contract.StarterList, Real.StarterList>>,
  Assert<IsAssignable<Contract.ConfigWriterList, Real.ConfigWriterList>>,
  Assert<IsAssignable<Contract.EnvHandler<Contract.Compiler>, Real.EnvHandler<Real.Compiler>>>,
  Assert<IsAssignable<Contract.Preview, Real.Preview>>,
  Assert<IsAssignable<Contract.Bundler, Real.Bundler>>,
  Assert<IsAssignable<Contract.DevServer, Real.DevServer>>,
  Assert<IsAssignable<Contract.Application, Real.Application>>,
  Assert<IsAssignable<Contract.ApplicationType<unknown>, Real.ApplicationType<unknown>>>,
  Assert<IsAssignable<Contract.AppTypeList, Real.AppTypeList>>,
  Assert<IsAssignable<Contract.EnvHandler<Contract.SchemaExtractor>, Real.EnvHandler<Real.SchemaExtractor>>>,
];

// services built against the aspects' types are used in envs written against the contract.
export type ServicesToContract = [
  Assert<IsAssignable<Real.EnvHandler<Real.Compiler>, Contract.EnvHandler<Contract.Compiler>>>,
  Assert<IsAssignable<Real.EnvHandler<Real.Tester>, Contract.EnvHandler<Contract.Tester>>>,
  Assert<IsAssignable<Real.EnvHandler<Real.Linter>, Contract.EnvHandler<Contract.Linter>>>,
  Assert<IsAssignable<Real.EnvHandler<Real.Preview>, Contract.EnvHandler<Contract.Preview>>>,
  Assert<IsAssignable<Real.EnvHandler<Real.Bundler>, Contract.EnvHandler<Contract.Bundler>>>,
  Assert<IsAssignable<Real.EnvHandler<Real.DevServer>, Contract.EnvHandler<Contract.DevServer>>>,
  Assert<
    IsAssignable<Real.EnvHandler<Real.ApplicationType<unknown>>, Contract.EnvHandler<Contract.ApplicationType<unknown>>>
  >,
];

describe('envs contracts', () => {
  it('should export the runtime values', async () => {
    const contract = await import('./index');
    expect(contract.CAPSULE_ARTIFACTS_DIR).to.equal('artifacts');
    expect(contract.Pipeline.from([]).tasks).to.deep.equal([]);
    expect(contract.COMPONENT_PREVIEW_STRATEGY_NAME).to.equal('component');
    expect(contract.WORKSPACE_ASPECT_ID).to.equal('teambit.workspace/workspace');
  });

  it('should create the TypeScript schema extractor through the typescript aspect', async () => {
    const { typescriptSchemaExtractor, TYPESCRIPT_ASPECT_ID } = await import('./index');
    const extractor = { extract: async () => ({}) as any, dispose: () => {} };
    const calls: unknown[] = [];
    const typescriptAspect = {
      createSchemaExtractorFromOptions: (options: unknown) => {
        calls.push(options);
        return extractor;
      },
    };
    const context = { getAspect: (id: string) => (id === TYPESCRIPT_ASPECT_ID ? typescriptAspect : undefined) } as any;
    expect(typescriptSchemaExtractor({ tsconfig: 'tsconfig.json' })(context)).to.equal(extractor);
    expect(calls).to.deep.equal([{ tsconfig: 'tsconfig.json' }]);
  });

  it('should throw a clear error when Bit is too old for typescriptSchemaExtractor', async () => {
    const { typescriptSchemaExtractor } = await import('./index');
    const context = { getAspect: () => ({}) } as any;
    expect(() => typescriptSchemaExtractor()(context)).to.throw(/newer version of Bit/);
  });
});
