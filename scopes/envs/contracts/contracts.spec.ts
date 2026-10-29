import { expect } from 'chai';
import type { EnvContext, EnvHandler, ExecutionContext } from '@teambit/envs';
import type { Component, ComponentMap } from '@teambit/component';
import type { Capsule, Network } from '@teambit/isolator';
import type { BuildContext, BuildTask, Pipeline, TaskResultsList } from '@teambit/builder';
import type { Compiler } from '@teambit/compiler';
import type { Tester, TesterContext, Tests } from '@teambit/tester';
import type { Linter, LinterContext } from '@teambit/linter';
import type { Formatter, FormatterContext } from '@teambit/formatter';
import type { SchemaExtractor } from '@teambit/schema';
import type { Preview, RenderingContext } from '@teambit/preview';
import type { PackageGenerator } from '@teambit/pkg';
import type { TemplateList, StarterList, ComponentContext, WorkspaceContext } from '@teambit/generator';
import type { ConfigWriterList } from '@teambit/workspace-config-files';
import type { Bundler, BundlerContext, DevServer, DevServerContext } from '@teambit/bundler';
import type {
  AppContext,
  AppBuildContext,
  AppDeployContext,
  Application,
  ApplicationType,
  AppTypeList,
} from '@teambit/application';
import type { PubsubMain } from '@teambit/pubsub';
import type { Workspace } from '@teambit/workspace';
import type { DocsRootProps } from '@teambit/docs';
import type { TypescriptMain } from '@teambit/typescript';
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
  Assert<IsAssignable<EnvContext, Contract.EnvContext>>,
  Assert<IsAssignable<ExecutionContext, Contract.ExecutionContext>>,
  Assert<IsAssignable<Component, Contract.Component>>,
  Assert<IsAssignable<ComponentMap<string>, Contract.ComponentMap<string>>>,
  Assert<IsAssignable<Capsule, Contract.Capsule>>,
  Assert<IsAssignable<Network, Contract.Network>>,
  Assert<IsAssignable<BuildContext, Contract.BuildContext>>,
  Assert<IsAssignable<TaskResultsList, Contract.TaskResultsList>>,
  Assert<IsAssignable<TesterContext, Contract.TesterContext>>,
  Assert<IsAssignable<LinterContext, Contract.LinterContext>>,
  Assert<IsAssignable<FormatterContext, Contract.FormatterContext>>,
  Assert<IsAssignable<ComponentContext, Contract.ComponentContext>>,
  Assert<IsAssignable<WorkspaceContext, Contract.WorkspaceContext>>,
  Assert<IsAssignable<BundlerContext, Contract.BundlerContext>>,
  Assert<IsAssignable<DevServerContext, Contract.DevServerContext>>,
  Assert<IsAssignable<AppContext, Contract.AppContext>>,
  Assert<IsAssignable<AppBuildContext, Contract.AppBuildContext>>,
  Assert<IsAssignable<AppDeployContext, Contract.AppDeployContext>>,
  Assert<IsAssignable<RenderingContext, Contract.RenderingContext>>,
  Assert<IsAssignable<DocsRootProps, Contract.DocsRootProps>>,
  // envs get these aspects from the env context.
  Assert<IsAssignable<Workspace, Contract.Workspace>>,
  Assert<IsAssignable<PubsubMain, Contract.PubsubMain>>,
  Assert<IsAssignable<TypescriptMain, Contract.TypescriptSchemaProvider>>,
];

// envs return these to Bit.
export type EnvToBit = [
  Assert<IsAssignable<Contract.Compiler, Compiler>>,
  Assert<IsAssignable<Contract.Tester, Tester>>,
  Assert<IsAssignable<Contract.Linter, Linter>>,
  Assert<IsAssignable<Contract.Formatter, Formatter>>,
  Assert<IsAssignable<Contract.SchemaExtractor, SchemaExtractor>>,
  Assert<IsAssignable<Contract.BuildTask, BuildTask>>,
  Assert<IsAssignable<Contract.Pipeline, Pipeline>>,
  Assert<IsAssignable<Contract.Tests, Tests>>,
  Assert<IsAssignable<Contract.PackageGenerator, PackageGenerator>>,
  Assert<IsAssignable<Contract.TemplateList, TemplateList>>,
  Assert<IsAssignable<Contract.StarterList, StarterList>>,
  Assert<IsAssignable<Contract.ConfigWriterList, ConfigWriterList>>,
  Assert<IsAssignable<Contract.EnvHandler<Contract.Compiler>, EnvHandler<Compiler>>>,
  Assert<IsAssignable<Contract.Preview, Preview>>,
  Assert<IsAssignable<Contract.Bundler, Bundler>>,
  Assert<IsAssignable<Contract.DevServer, DevServer>>,
  Assert<IsAssignable<Contract.Application, Application>>,
  Assert<IsAssignable<Contract.ApplicationType<unknown>, ApplicationType<unknown>>>,
  Assert<IsAssignable<Contract.AppTypeList, AppTypeList>>,
  Assert<IsAssignable<Contract.EnvHandler<Contract.SchemaExtractor>, EnvHandler<SchemaExtractor>>>,
];

// services built against the aspects' types are used in envs written against the contract.
export type ServicesToContract = [
  Assert<IsAssignable<EnvHandler<Compiler>, Contract.EnvHandler<Contract.Compiler>>>,
  Assert<IsAssignable<EnvHandler<Tester>, Contract.EnvHandler<Contract.Tester>>>,
  Assert<IsAssignable<EnvHandler<Linter>, Contract.EnvHandler<Contract.Linter>>>,
  Assert<IsAssignable<EnvHandler<Preview>, Contract.EnvHandler<Contract.Preview>>>,
  Assert<IsAssignable<EnvHandler<Bundler>, Contract.EnvHandler<Contract.Bundler>>>,
  Assert<IsAssignable<EnvHandler<DevServer>, Contract.EnvHandler<Contract.DevServer>>>,
  Assert<IsAssignable<EnvHandler<ApplicationType<unknown>>, Contract.EnvHandler<Contract.ApplicationType<unknown>>>>,
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
