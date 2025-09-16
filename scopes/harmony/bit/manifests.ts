import { AspectAspect } from '@teambit/aspect/aspect.aspect';
import { AspectLoaderAspect } from '@teambit/aspect-loader/aspect-loader.aspect';
import { BuilderAspect } from '@teambit/builder/builder.aspect';
import { BundlerAspect } from '@teambit/bundler/bundler.aspect';
import { CacheAspect } from '@teambit/cache/cache.aspect';
import { CLIAspect } from '@teambit/cli/cli.aspect';
import { CompilerAspect } from '@teambit/compiler/compiler.aspect';
import { ComponentAspect } from '@teambit/component/component.aspect';
import { CompositionsAspect } from '@teambit/compositions/compositions.aspect';
import { ConfigAspect } from '@teambit/config/config.aspect';
import { DependencyResolverAspect } from '@teambit/dependency-resolver/dependency-resolver.aspect';
import { DeprecationAspect } from '@teambit/deprecation/deprecation.aspect';
import { DocsAspect } from '@teambit/docs/docs.aspect';
import { EnvsAspect } from '@teambit/envs/environments.aspect';
import { EnvAspect } from '@teambit/env/env.aspect';
import { ExpressAspect } from '@teambit/express/express.aspect';
import { YarnAspect } from '@teambit/yarn/yarn.aspect';
import { GeneratorAspect } from '@teambit/generator/generator.aspect';
import { HarmonyUiAppAspect } from '@teambit/harmony-ui-app/harmony-ui-app.aspect';
import { GraphAspect } from '@teambit/graph/graph.aspect';
import { GraphqlAspect } from '@teambit/graphql/graphql.aspect';
import { InsightsAspect } from '@teambit/insights/insights.aspect';
import { IsolatorAspect } from '@teambit/isolator/isolator.aspect';
import { JestAspect } from '@teambit/jest/jest.aspect';
import { LoggerAspect } from '@teambit/logger/logger.aspect';
import { NodeAspect } from '@teambit/node/node.aspect';
import { NotificationsAspect } from '@teambit/notifications/notifications.aspect';
import { PanelUiAspect } from '@teambit/panels/panel-ui.aspect';
import { PkgAspect } from '@teambit/pkg/pkg.aspect';
import { PnpmAspect } from '@teambit/pnpm/pnpm.aspect';
import { PreviewAspect } from '@teambit/preview/preview.aspect';
import { ComponentSizerAspect } from '@teambit/component-sizer/component-sizer.aspect';
import { ReactAspect } from '@teambit/react/react.aspect';
import { VueAspect } from '@teambit/vue-aspect/vue.aspect';
import { ReactRouterAspect } from '@teambit/react-router/react-router.aspect';
import { SchemaAspect } from '@teambit/schema/schema.aspect';
import { PubsubAspect } from '@teambit/pubsub/pubsub.aspect';
import { ScopeAspect } from '@teambit/scope/scope.aspect';
// import { StencilAspect } from '@teambit/stencil/stencil.aspect';
import { TesterAspect } from '@teambit/tester/tester.aspect';
import { MultiTesterAspect } from '@teambit/multi-tester/multi-tester.aspect';
import { TypescriptAspect } from '@teambit/typescript/typescript.aspect';
import { BabelAspect } from '@teambit/babel/babel.aspect';
import { UIAspect } from '@teambit/ui/ui.aspect';
import { VariantsAspect } from '@teambit/variants/variants.aspect';
import { WebpackAspect } from '@teambit/webpack/webpack.aspect';
import { WorkspaceAspect } from '@teambit/workspace/workspace.aspect';
import { WorkspaceConfigFilesAspect } from '@teambit/workspace-config-files/workspace-config-files.aspect';
import { InstallAspect } from '@teambit/install/install.aspect';
import { LinterAspect } from '@teambit/linter/linter.aspect';
import { FormatterAspect } from '@teambit/formatter/formatter.aspect';
import { ChangelogAspect } from '@teambit/changelog/changelog.aspect';
import { CodeAspect } from '@teambit/code/code.aspect';
import { CommandBarAspect } from '@teambit/command-bar/command-bar.aspect';
import { SidebarAspect } from '@teambit/sidebar/sidebar.aspect';
import { ComponentTreeAspect } from '@teambit/component-tree/component-tree.aspect';
import { DevFilesAspect } from '@teambit/dev-files/dev-files.aspect';
import { ESLintAspect } from '@teambit/eslint/eslint.aspect';
import { PrettierAspect } from '@teambit/prettier/prettier.aspect';
import { WorkerAspect } from '@teambit/worker/worker.aspect';
import { GlobalConfigAspect } from '@teambit/global-config/global-config.aspect';
import { MultiCompilerAspect } from '@teambit/multi-compiler/multi-compiler.aspect';
import { MDXAspect } from '@teambit/mdx/mdx.aspect';
import { ReadmeAspect } from '@teambit/readme/readme.aspect';
import { ApplicationAspect } from '@teambit/application/application.aspect';
import { ExportAspect } from '@teambit/export/export.aspect';
import { ImporterAspect } from '@teambit/importer/importer.aspect';
import { EjectAspect } from '@teambit/eject/eject.aspect';
import { UserAgentAspect } from '@teambit/user-agent/user-agent.aspect';
import { LanesAspect } from '@teambit/lanes/lanes.aspect';
import { ForkingAspect } from '@teambit/forking/forking.aspect';
import { RenamingAspect } from '@teambit/renaming/renaming.aspect';
import { ComponentLogAspect } from '@teambit/component-log/component-log.aspect';
import { ClearCacheAspect } from '@teambit/clear-cache/clear-cache.aspect';
import { DiagnosticAspect } from '@teambit/diagnostic/diagnostic.aspect';
import { NewComponentHelperAspect } from '@teambit/new-component-helper/new-component-helper.aspect';
import { MochaAspect } from '@teambit/mocha/mocha.aspect';
import { CommunityAspect } from '@teambit/community/community.aspect';
import { CloudAspect } from '@teambit/cloud/cloud.aspect';
import { StatusAspect } from '@teambit/status/status.aspect';
import { SnappingAspect } from '@teambit/snapping/snapping.aspect';
import { MergingAspect } from '@teambit/merging/merging.aspect';
import { IssuesAspect } from '@teambit/issues/issues.aspect';
import { RefactoringAspect } from '@teambit/refactoring/refactoring.aspect';
import { ComponentCompareAspect } from '@teambit/component-compare/component-compare.aspect';
import { ListerAspect } from '@teambit/lister/lister.aspect';
import { DependenciesAspect } from '@teambit/dependencies/dependencies.aspect';
import { RemoveAspect } from '@teambit/remove/remove.aspect';
import { MergeLanesAspect } from '@teambit/merge-lanes/merge-lanes.aspect';
import { CheckoutAspect } from '@teambit/checkout/checkout.aspect';
import { APIReferenceAspect } from '@teambit/api-reference/api-reference.aspect';
import { ApiServerAspect } from '@teambit/api-server/api-server.aspect';
import { ComponentWriterAspect } from '@teambit/component-writer/component-writer.aspect';
import { TrackerAspect } from '@teambit/tracker/tracker.aspect';
import { MoverAspect } from '@teambit/mover/mover.aspect';
import { WatcherAspect } from '@teambit/watcher/watcher.aspect';
import { StashAspect } from '@teambit/stash/stash.aspect';
import { GitAspect } from '@teambit/git/git.aspect';
import { IpcEventsAspect } from '@teambit/ipc-events/ipc-events.aspect';
import { ConfigMergerAspect } from '@teambit/config-merger/config-merger.aspect';
import { VersionHistoryAspect } from '@teambit/version-history/version-history.aspect';
import { HostInitializerAspect } from '@teambit/host-initializer/host-initializer.aspect';
import { DoctorAspect } from '@teambit/doctor/doctor.aspect';
import { BitAspect } from './bit.aspect';
import { ConfigStoreAspect } from '@teambit/config-store/config-store.aspect';
import { CliMcpServerAspect } from '@teambit/cli-mcp-server/cli-mcp-server.aspect';
import { CiAspect } from '@teambit/ci/ci.aspect';

/**
 * this is the place to register core aspects.
 * if you modify this list (add/remove), please run `npm run generate-core-aspects-ids` to update
 * teambit.harmony/testing/load-aspect component, which should not depend on this component.
 * (it's done automatically by Circle during tag workflow)
 */
export function getManifestsMap() {
  return {
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
  [VueAspect.id]: VueAspect,
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
  [ConfigStoreAspect.id]: ConfigStoreAspect,
  [CliMcpServerAspect.id]: CliMcpServerAspect,
  [CiAspect.id]: CiAspect,
  };
}

export function isCoreAspect(id: string) {
  const manifestsMap = getManifestsMap();
  const _reserved = [BitAspect.id, ConfigAspect.id];
  if (_reserved.includes(id)) return true;
  return !!manifestsMap[id];
}

export function getAllCoreAspectsIds(): string[] {
  const manifestsMap = getManifestsMap();
  const _reserved = [BitAspect.id, ConfigAspect.id];
  return [...Object.keys(manifestsMap), ..._reserved];
}
