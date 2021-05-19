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
import { GeneratorAspect } from '@teambit/generator';
import { HarmonyUiAppAspect } from '@teambit/harmony-ui-app';
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
import { ReactNativeAspect } from '@teambit/react-native';
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
import { CodeAspect } from '@teambit/code';
import { CommandBarAspect } from '@teambit/command-bar';
import { SidebarAspect } from '@teambit/sidebar';
import { ComponentTreeAspect } from '@teambit/component-tree';
import { DevFilesAspect } from '@teambit/dev-files';
import { ESLintAspect } from '@teambit/eslint';
import { SignAspect } from '@teambit/sign';
import WorkerAspect from '@teambit/worker';
import { GlobalConfigAspect } from '@teambit/global-config';
import MultiCompilerAspect from '@teambit/multi-compiler';
import MDXAspect from '@teambit/mdx';
import { ApplicationAspect } from '@teambit/application';
import { UpdateDependenciesAspect } from '@teambit/update-dependencies';
import { ExportAspect } from '@teambit/export';
import { EjectAspect } from '@teambit/eject';
import { UserAgentAspect } from '@teambit/user-agent';
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
  [MDXAspect.id]: MDXAspect,
  [PreviewAspect.id]: PreviewAspect,
  [DocsAspect.id]: DocsAspect,
  [YarnAspect.id]: YarnAspect,
  [CompositionsAspect.id]: CompositionsAspect,
  [GlobalConfigAspect.id]: GlobalConfigAspect,
  [GraphqlAspect.id]: GraphqlAspect,
  [PnpmAspect.id]: PnpmAspect,
  [MultiCompilerAspect.id]: MultiCompilerAspect,
  [UIAspect.id]: UIAspect,
  [GeneratorAspect.id]: GeneratorAspect,
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
  [ReactNativeAspect.id]: ReactNativeAspect,
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
  [TypescriptAspect.id]: TypescriptAspect,
  [PanelUiAspect.id]: PanelUiAspect,
  [BabelAspect.id]: BabelAspect,
  [NodeAspect.id]: NodeAspect,
  [NotificationsAspect.id]: NotificationsAspect,
  [BundlerAspect.id]: BundlerAspect,
  [JestAspect.id]: JestAspect,
  [CacheAspect.id]: CacheAspect,
  [ChangelogAspect.id]: ChangelogAspect,
  [CodeAspect.id]: CodeAspect,
  [CommandBarAspect.id]: CommandBarAspect,
  [SidebarAspect.id]: SidebarAspect,
  [ComponentTreeAspect.id]: ComponentTreeAspect,
  [SignAspect.id]: SignAspect,
  [UpdateDependenciesAspect.id]: UpdateDependenciesAspect,
  [ExportAspect.id]: ExportAspect,
  [HarmonyUiAppAspect.id]: HarmonyUiAppAspect,
  [UserAgentAspect.id]: UserAgentAspect,
  [ApplicationAspect.id]: ApplicationAspect,
  [EjectAspect.id]: EjectAspect,
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
