import { AspectAspect } from '@teambit/aspect';
import AspectLoaderAspect from '@teambit/aspect-loader';
import { BuilderAspect } from '@teambit/builder';
import { BundlerAspect } from '@teambit/bundler';
import { CacheAspect } from '@teambit/cache';
import { CLIAspect } from '@teambit/cli';
import { CompilerAspect } from '@teambit/compiler';
import { ComponentAspect } from '@teambit/component';
import { CompositionsAspect } from '@teambit/compositions';
import { ConfigAspect } from '@teambit/config';
import { DependencyResolverAspect } from '@teambit/dependency-resolver';
import { DeprecationAspect } from '@teambit/deprecation';
import { DocsAspect } from '@teambit/docs';
import { EnvsAspect } from '@teambit/envs';
import { ExpressAspect } from '@teambit/express';
import { FlowsAspect } from '@teambit/flows';
import { YarnAspect } from '@teambit/yarn';
import { CreateAspect } from '@teambit/generator';
import { GraphAspect } from '@teambit/graph';
import { GraphqlAspect } from '@teambit/graphql';
import { InsightsAspect } from '@teambit/insights';
import { IsolatorAspect } from '@teambit/isolator';
import { JestAspect } from '@teambit/jest';
import { LoggerAspect } from '@teambit/logger';
import { NodeAspect } from '@teambit/node';
import { NotificationsAspect } from '@teambit/notifications';
import { PanelUiAspect } from '@teambit/panels';
import { PkgAspect } from '@teambit/pkg';
import { PnpmAspect } from '@teambit/pnpm';
import { PreviewAspect } from '@teambit/preview';
import { ReactAspect } from '@teambit/react';
import { ReactRouterAspect } from '@teambit/react-router';
import { SchemaAspect } from '@teambit/schema';
import { PubsubAspect } from '@teambit/pubsub';
import { ScopeAspect } from '@teambit/scope';
// import { StencilAspect } from '@teambit/stencil';
import { TesterAspect } from '@teambit/tester';
import { TypescriptAspect } from '@teambit/typescript';
import { BabelAspect } from '@teambit/babel';
import { UIAspect } from '@teambit/ui';
import { VariantsAspect } from '@teambit/variants';
import { WebpackAspect } from '@teambit/webpack';
import { WorkspaceAspect } from '@teambit/workspace';
import { LinterAspect } from '@teambit/linter';
import { ChangelogAspect } from '@teambit/changelog';
import { CommandBarAspect } from '@teambit/command-bar';
import { SidebarAspect } from '@teambit/sidebar';
import { ComponentTreeAspect } from '@teambit/component-tree';
import { DevFilesAspect } from '@teambit/dev-files';
import { ESLintAspect } from '@teambit/eslint';
import WorkerAspect from '@teambit/worker';
import { BitAspect } from './bit.aspect';

export const manifestsMap = {
  [AspectLoaderAspect.id]: AspectLoaderAspect,
  [CLIAspect.id]: CLIAspect,
  [DevFilesAspect.id]: DevFilesAspect,
  [WorkspaceAspect.id]: WorkspaceAspect,
  [ESLintAspect.id]: ESLintAspect,
  [CompilerAspect.id]: CompilerAspect,
  [LinterAspect.id]: LinterAspect,
  [ComponentAspect.id]: ComponentAspect,
  [PreviewAspect.id]: PreviewAspect,
  [DocsAspect.id]: DocsAspect,
  [YarnAspect.id]: YarnAspect,
  [CompositionsAspect.id]: CompositionsAspect,
  [GraphqlAspect.id]: GraphqlAspect,
  [PnpmAspect.id]: PnpmAspect,
  [UIAspect.id]: UIAspect,
  [CreateAspect.id]: CreateAspect,
  [EnvsAspect.id]: EnvsAspect,
  [FlowsAspect.id]: FlowsAspect,
  [GraphAspect.id]: GraphAspect,
  [PubsubAspect.id]: PubsubAspect,
  [DependencyResolverAspect.id]: DependencyResolverAspect,
  [InsightsAspect.id]: InsightsAspect,
  [IsolatorAspect.id]: IsolatorAspect,
  [LoggerAspect.id]: LoggerAspect,
  [PkgAspect.id]: PkgAspect,
  [ReactAspect.id]: ReactAspect,
  [WorkerAspect.id]: WorkerAspect,
  // [StencilAspect.id]: StencilAspect,
  [ScopeAspect.id]: ScopeAspect,
  [TesterAspect.id]: TesterAspect,
  [BuilderAspect.id]: BuilderAspect,
  [VariantsAspect.id]: VariantsAspect,
  [DeprecationAspect.id]: DeprecationAspect,
  [ExpressAspect.id]: ExpressAspect,
  [AspectAspect.id]: AspectAspect,
  [WebpackAspect.id]: WebpackAspect,
  [SchemaAspect.id]: SchemaAspect,
  [ReactRouterAspect.id]: ReactRouterAspect,
  [PanelUiAspect.id]: PanelUiAspect,
  [TypescriptAspect.id]: TypescriptAspect,
  [BabelAspect.id]: BabelAspect,
  [NodeAspect.id]: NodeAspect,
  [NotificationsAspect.id]: NotificationsAspect,
  [BundlerAspect.id]: BundlerAspect,
  [JestAspect.id]: JestAspect,
  [CacheAspect.id]: CacheAspect,
  [ChangelogAspect.id]: ChangelogAspect,
  [CommandBarAspect.id]: CommandBarAspect,
  [SidebarAspect.id]: SidebarAspect,
  [ComponentTreeAspect.id]: ComponentTreeAspect,
};

export function isCoreAspect(id: string) {
  const _reserved = [BitAspect.id, ConfigAspect.id];
  if (_reserved.includes(id)) return true;
  return !!manifestsMap[id];
}

export function getAllCoreAspectsIds(): string[] {
  const _reserved = [BitAspect.id, ConfigAspect.id];
  return [...Object.keys(manifestsMap), ..._reserved];
}
