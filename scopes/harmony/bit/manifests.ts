import { AspectAspect } from '@teambit/aspect';
import { AspectLoaderAspect } from '@teambit/aspect-loader';
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
import { EnvAspect } from '@teambit/env';
import { ExpressAspect } from '@teambit/express';
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
import { ComponentSizerAspect } from '@teambit/component-sizer';
import { ReactAspect } from '@teambit/react';
import { ReactRouterAspect } from '@teambit/react-router';
import { SchemaAspect } from '@teambit/schema';
import { PubsubAspect } from '@teambit/pubsub';
import { ScopeAspect } from '@teambit/scope';
// import { StencilAspect } from '@teambit/stencil';
import { TesterAspect } from '@teambit/tester';
import { MultiTesterAspect } from '@teambit/multi-tester';
import { TypescriptAspect } from '@teambit/typescript';
import { BabelAspect } from '@teambit/babel';
import { UIAspect } from '@teambit/ui';
import { VariantsAspect } from '@teambit/variants';
import { WebpackAspect } from '@teambit/webpack';
import { WorkspaceAspect } from '@teambit/workspace';
import { WorkspaceConfigFilesAspect } from '@teambit/workspace-config-files';
import { InstallAspect } from '@teambit/install';
import { LinterAspect } from '@teambit/linter';
import { FormatterAspect } from '@teambit/formatter';
import { ChangelogAspect } from '@teambit/changelog';
import { CodeAspect } from '@teambit/code';
import { CommandBarAspect } from '@teambit/command-bar';
import { SidebarAspect } from '@teambit/sidebar';
import { ComponentTreeAspect } from '@teambit/component-tree';
import { DevFilesAspect } from '@teambit/dev-files';
import { ESLintAspect } from '@teambit/eslint';
import { PrettierAspect } from '@teambit/prettier';
import { WorkerAspect } from '@teambit/worker';
import { GlobalConfigAspect } from '@teambit/global-config';
import { MultiCompilerAspect } from '@teambit/multi-compiler';
import { MDXAspect } from '@teambit/mdx';
import { ReadmeAspect } from '@teambit/readme';
import { ApplicationAspect } from '@teambit/application';
import { ExportAspect } from '@teambit/export';
import { ImporterAspect } from '@teambit/importer';
import { EjectAspect } from '@teambit/eject';
import { UserAgentAspect } from '@teambit/user-agent';
import { LanesAspect } from '@teambit/lanes';
import { ForkingAspect } from '@teambit/forking';
import { RenamingAspect } from '@teambit/renaming';
import { ComponentLogAspect } from '@teambit/component-log';
import { ClearCacheAspect } from '@teambit/clear-cache';
import { DiagnosticAspect } from '@teambit/diagnostic';
import { NewComponentHelperAspect } from '@teambit/new-component-helper';
import { MochaAspect } from '@teambit/mocha';
import { CommunityAspect } from '@teambit/community';
import { CloudAspect } from '@teambit/cloud';
import { StatusAspect } from '@teambit/status';
import { SnappingAspect } from '@teambit/snapping';
import { MergingAspect } from '@teambit/merging';
import { IssuesAspect } from '@teambit/issues';
import { RefactoringAspect } from '@teambit/refactoring';
import { ComponentCompareAspect } from '@teambit/component-compare';
import { ListerAspect } from '@teambit/lister';
import { DependenciesAspect } from '@teambit/dependencies';
import { RemoveAspect } from '@teambit/remove';
import { MergeLanesAspect } from '@teambit/merge-lanes';
import { CheckoutAspect } from '@teambit/checkout';
import { APIReferenceAspect } from '@teambit/api-reference';
import { ApiServerAspect } from '@teambit/api-server';
import { ComponentWriterAspect } from '@teambit/component-writer';
import { TrackerAspect } from '@teambit/tracker';
import { MoverAspect } from '@teambit/mover';
import { WatcherAspect } from '@teambit/watcher';
import { StashAspect } from '@teambit/stash';
import { GitAspect } from '@teambit/git';
import { IpcEventsAspect } from '@teambit/ipc-events';
import { ConfigMergerAspect } from '@teambit/config-merger';
import { VersionHistoryAspect } from '@teambit/version-history';
import { HostInitializerAspect } from '@teambit/host-initializer';
import { DoctorAspect } from '@teambit/doctor';
import { ObjectsAspect } from '@teambit/objects';
import { BitAspect } from './bit.aspect';
import { ConfigStoreAspect } from '@teambit/config-store';
import { CliMcpServerAspect } from '@teambit/cli-mcp-server';

/**
 * this is the place to register core aspects.
 * if you modify this list (add/remove), please run `npm run generate-core-aspects-ids` to update
 * teambit.harmony/testing/load-aspect component, which should not depend on this component.
 * (it's done automatically by Circle during tag workflow)
 */
export const manifestsMap = {
  [AspectLoaderAspect.id]: AspectLoaderAspect,
  [CLIAspect.id]: CLIAspect,
  [DevFilesAspect.id]: DevFilesAspect,
  [WorkspaceAspect.id]: WorkspaceAspect,
  [WorkspaceConfigFilesAspect.id]: WorkspaceConfigFilesAspect,
  [InstallAspect.id]: InstallAspect,
  [ESLintAspect.id]: ESLintAspect,
  [PrettierAspect.id]: PrettierAspect,
  [CompilerAspect.id]: CompilerAspect,
  [LinterAspect.id]: LinterAspect,
  [FormatterAspect.id]: FormatterAspect,
  [ComponentAspect.id]: ComponentAspect,
  [MDXAspect.id]: MDXAspect,
  [ReadmeAspect.id]: ReadmeAspect,
  [PreviewAspect.id]: PreviewAspect,
  [ComponentSizerAspect.id]: ComponentSizerAspect,
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
  [EnvAspect.id]: EnvAspect,
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
  [MultiTesterAspect.id]: MultiTesterAspect,
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
  [ExportAspect.id]: ExportAspect,
  [ImporterAspect.id]: ImporterAspect,
  [HarmonyUiAppAspect.id]: HarmonyUiAppAspect,
  [UserAgentAspect.id]: UserAgentAspect,
  [ApplicationAspect.id]: ApplicationAspect,
  [EjectAspect.id]: EjectAspect,
  [LanesAspect.id]: LanesAspect,
  [ForkingAspect.id]: ForkingAspect,
  [RenamingAspect.id]: RenamingAspect,
  [NewComponentHelperAspect.id]: NewComponentHelperAspect,
  [ComponentLogAspect.id]: ComponentLogAspect,
  [ClearCacheAspect.id]: ClearCacheAspect,
  [MochaAspect.id]: MochaAspect,
  [DiagnosticAspect.id]: DiagnosticAspect,
  [StatusAspect.id]: StatusAspect,
  [CommunityAspect.id]: CommunityAspect,
  [CloudAspect.id]: CloudAspect,
  [SnappingAspect.id]: SnappingAspect,
  [MergingAspect.id]: MergingAspect,
  [IssuesAspect.id]: IssuesAspect,
  [RefactoringAspect.id]: RefactoringAspect,
  [ComponentCompareAspect.id]: ComponentCompareAspect,
  [ListerAspect.id]: ListerAspect,
  [DependenciesAspect.id]: DependenciesAspect,
  [RemoveAspect.id]: RemoveAspect,
  [MergeLanesAspect.id]: MergeLanesAspect,
  [CheckoutAspect.id]: CheckoutAspect,
  [ComponentWriterAspect.id]: ComponentWriterAspect,
  [APIReferenceAspect.id]: APIReferenceAspect,
  [ApiServerAspect.id]: ApiServerAspect,
  [TrackerAspect.id]: TrackerAspect,
  [MoverAspect.id]: MoverAspect,
  [WatcherAspect.id]: WatcherAspect,
  [StashAspect.id]: StashAspect,
  [GitAspect.id]: GitAspect,
  [IpcEventsAspect.id]: IpcEventsAspect,
  [ConfigMergerAspect.id]: ConfigMergerAspect,
  [VersionHistoryAspect.id]: VersionHistoryAspect,
  [HostInitializerAspect.id]: HostInitializerAspect,
  [DoctorAspect.id]: DoctorAspect,
  [ObjectsAspect.id]: ObjectsAspect,
  [ConfigStoreAspect.id]: ConfigStoreAspect,
  [CliMcpServerAspect.id]: CliMcpServerAspect,
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
