import { AspectAspect } from '@teambit/aspect/dist/aspect.aspect.js';
import { AspectLoaderAspect } from '@teambit/aspect-loader/dist/aspect-loader.aspect.js';
import { AspectLoaderGraphqlBinderAspect } from '@teambit/aspect-loader-graphql-binder/dist/aspect-loader-graphql-binder.aspect.js';
import { BuilderAspect } from '@teambit/builder/dist/builder.aspect.js';
import { BundlerAspect } from '@teambit/bundler/dist/bundler.aspect.js';
import { CacheAspect } from '@teambit/cache/dist/cache.aspect.js';
import { CLIAspect } from '@teambit/cli/dist/cli.aspect.js';
import { CompilerAspect } from '@teambit/compiler/dist/compiler.aspect.js';
import { ComponentAspect } from '@teambit/component/dist/component.aspect.js';
import { CompositionsAspect } from '@teambit/compositions/dist/compositions.aspect.js';
import { ConfigAspect } from '@teambit/config/dist/config.aspect.js';
import { DependencyResolverAspect } from '@teambit/dependency-resolver/dist/dependency-resolver.aspect.js';
import { DeprecationAspect } from '@teambit/deprecation/dist/deprecation.aspect.js';
import { DocsAspect } from '@teambit/docs/dist/docs.aspect.js';
import { EnvsAspect } from '@teambit/envs/dist/environments.aspect.js';
import { EnvsGraphqlBinderAspect } from '@teambit/envs-graphql-binder/dist/envs-graphql-binder.aspect.js';
import { EnvAspect } from '@teambit/env/dist/env.aspect.js';
import { ExpressAspect } from '@teambit/express/dist/express.aspect.js';
import { YarnAspect } from '@teambit/yarn/dist/yarn.aspect.js';
import { GeneratorAspect } from '@teambit/generator/dist/generator.aspect.js';
import { HarmonyUiAppAspect } from '@teambit/harmony-ui-app/dist/harmony-ui-app.aspect.js';
import { GraphAspect } from '@teambit/graph/dist/graph.aspect.js';
import { GraphqlAspect } from '@teambit/graphql/dist/graphql.aspect.js';
import { InsightsAspect } from '@teambit/insights/dist/insights.aspect.js';
import { IsolatorAspect } from '@teambit/isolator/dist/isolator.aspect.js';
import { JestAspect } from '@teambit/jest/dist/jest.aspect.js';
import { LoggerAspect } from '@teambit/logger/dist/logger.aspect.js';
import { NodeAspect } from '@teambit/node/dist/node.aspect.js';
import { NotificationsAspect } from '@teambit/notifications/dist/notifications.aspect.js';
import { PanelUiAspect } from '@teambit/panels/dist/panel-ui.aspect.js';
import { PkgAspect } from '@teambit/pkg/dist/pkg.aspect.js';
import { PnpmAspect } from '@teambit/pnpm/dist/pnpm.aspect.js';
import { PreviewAspect } from '@teambit/preview/dist/preview.aspect.js';
import { ComponentSizerAspect } from '@teambit/component-sizer/dist/component-sizer.aspect.js';
import { ReactAspect } from '@teambit/react/dist/react.aspect.js';
import { VueAspect } from '@teambit/vue-aspect/dist/vue.aspect.js';
import { ReactRouterAspect } from '@teambit/react-router/dist/react-router.aspect.js';
import { SchemaAspect } from '@teambit/schema/dist/schema.aspect.js';
import { PubsubAspect } from '@teambit/pubsub/dist/pubsub.aspect.js';
import { ScopeAspect } from '@teambit/scope/dist/scope.aspect.js';
import { ScopeUiBinderAspect } from '@teambit/scope-ui-binder/dist/scope-ui-binder.aspect.js';
// import { StencilAspect } from '@teambit/stencil';
import { TesterAspect } from '@teambit/tester/dist/tester.aspect.js';
import { MultiTesterAspect } from '@teambit/multi-tester/dist/multi-tester.aspect.js';
import { TypescriptAspect } from '@teambit/typescript/dist/typescript.aspect.js';
import { BabelAspect } from '@teambit/babel/dist/babel.aspect.js';
import { UIAspect } from '@teambit/ui/dist/ui.aspect.js';
import { VariantsAspect } from '@teambit/variants/dist/variants.aspect.js';
import { WebpackAspect } from '@teambit/webpack/dist/webpack.aspect.js';
import { WorkspaceAspect } from '@teambit/workspace/dist/workspace.aspect.js';
import { WorkspaceUiBinderAspect } from '@teambit/workspace-ui-binder/dist/workspace-ui-binder.aspect.js';
import { WorkspaceConfigFilesAspect } from '@teambit/workspace-config-files/dist/workspace-config-files.aspect.js';
import { InstallAspect } from '@teambit/install/dist/install.aspect.js';
import { LinterAspect } from '@teambit/linter/dist/linter.aspect.js';
import { FormatterAspect } from '@teambit/formatter/dist/formatter.aspect.js';
import { ValidatorAspect } from '@teambit/validator/dist/validator.aspect.js';
import { ChangelogAspect } from '@teambit/changelog/dist/changelog.aspect.js';
import { CodeAspect } from '@teambit/code/dist/code.aspect.js';
import { CommandBarAspect } from '@teambit/command-bar/dist/command-bar.aspect.js';
import { SidebarAspect } from '@teambit/sidebar/dist/sidebar.aspect.js';
import { ComponentTreeAspect } from '@teambit/component-tree/dist/component-tree.aspect.js';
import { DevFilesAspect } from '@teambit/dev-files/dist/dev-files.aspect.js';
import { ESLintAspect } from '@teambit/eslint/dist/eslint.aspect.js';
import { PrettierAspect } from '@teambit/prettier/dist/prettier.aspect.js';
import { WorkerAspect } from '@teambit/worker/dist/worker.aspect.js';
import { GlobalConfigAspect } from '@teambit/global-config/dist/global-config.aspect.js';
import { MultiCompilerAspect } from '@teambit/multi-compiler/dist/multi-compiler.aspect.js';
import { MDXAspect } from '@teambit/mdx/dist/mdx.aspect.js';
import { ReadmeAspect } from '@teambit/readme/dist/readme.aspect.js';
import { ApplicationAspect } from '@teambit/application/dist/application.aspect.js';
import { ExportAspect } from '@teambit/export/dist/export.aspect.js';
import { ImporterAspect } from '@teambit/importer/dist/importer.aspect.js';
import { EjectAspect } from '@teambit/eject/dist/eject.aspect.js';
import { UserAgentAspect } from '@teambit/user-agent/dist/user-agent.aspect.js';
import { LanesAspect } from '@teambit/lanes/dist/lanes.aspect.js';
import { ForkingAspect } from '@teambit/forking/dist/forking.aspect.js';
import { RenamingAspect } from '@teambit/renaming/dist/renaming.aspect.js';
import { ComponentLogAspect } from '@teambit/component-log/dist/component-log.aspect.js';
import { ClearCacheAspect } from '@teambit/clear-cache/dist/clear-cache.aspect.js';
import { DiagnosticAspect } from '@teambit/diagnostic/dist/diagnostic.aspect.js';
import { NewComponentHelperAspect } from '@teambit/new-component-helper/dist/new-component-helper.aspect.js';
import { MochaAspect } from '@teambit/mocha/dist/mocha.aspect.js';
import { CommunityAspect } from '@teambit/community/dist/community.aspect.js';
import { CloudAspect } from '@teambit/cloud/dist/cloud.aspect.js';
import { StatusAspect } from '@teambit/status/dist/status.aspect.js';
import { SnappingAspect } from '@teambit/snapping/dist/snapping.aspect.js';
import { MergingAspect } from '@teambit/merging/dist/merging.aspect.js';
import { IssuesAspect } from '@teambit/issues/dist/issues.aspect.js';
import { RefactoringAspect } from '@teambit/refactoring/dist/refactoring.aspect.js';
import { ComponentCompareAspect } from '@teambit/component-compare/dist/component-compare.aspect.js';
import { ListerAspect } from '@teambit/lister/dist/lister.aspect.js';
import { DependenciesAspect } from '@teambit/dependencies/dist/dependencies.aspect.js';
import { RemoveAspect } from '@teambit/remove/dist/remove.aspect.js';
import { MergeLanesAspect } from '@teambit/merge-lanes/dist/merge-lanes.aspect.js';
import { CheckoutAspect } from '@teambit/checkout/dist/checkout.aspect.js';
import { APIReferenceAspect } from '@teambit/api-reference/dist/api-reference.aspect.js';
import { ApiServerAspect } from '@teambit/api-server/dist/api-server.aspect.js';
import { ComponentWriterAspect } from '@teambit/component-writer/dist/component-writer.aspect.js';
import { TrackerAspect } from '@teambit/tracker/dist/tracker.aspect.js';
import { MoverAspect } from '@teambit/mover/dist/mover.aspect.js';
import { WatcherAspect } from '@teambit/watcher/dist/watcher.aspect.js';
import { StashAspect } from '@teambit/stash/dist/stash.aspect.js';
import { GitAspect } from '@teambit/git/dist/git.aspect.js';
import { IpcEventsAspect } from '@teambit/ipc-events/dist/ipc-events.aspect.js';
import { ConfigMergerAspect } from '@teambit/config-merger/dist/config-merger.aspect.js';
import { VersionHistoryAspect } from '@teambit/version-history/dist/version-history.aspect.js';
import { HostInitializerAspect } from '@teambit/host-initializer/dist/host-initializer.aspect.js';
import { DoctorAspect } from '@teambit/doctor/dist/doctor.aspect.js';
import { ObjectsAspect } from '@teambit/objects/dist/objects.aspect.js';
import { BitAspect } from './bit.aspect';
import { ConfigStoreAspect } from '@teambit/config-store/dist/config-store.aspect.js';
import { CliMcpServerAspect } from '@teambit/cli-mcp-server/dist/cli-mcp-server.aspect.js';
import { CiAspect } from '@teambit/ci/dist/ci.aspect.js';
import { RippleAspect } from '@teambit/ripple/dist/ripple.aspect.js';
// `@teambit/scripts` ships with a restrictive `exports` map (only `.` is
// defined), so the direct-subpath trick used for every other aspect blows
// up with ERR_PACKAGE_PATH_NOT_EXPORTED. The barrel re-exports just the
// aspect manifest here, so the cost is tiny anyway.
import { ScriptsAspect } from '@teambit/scripts';

/**
 * this is the place to register core aspects.
 * if you modify this list (add/remove), please run `npm run generate-core-aspects-ids` to update
 * teambit.harmony/testing/load-aspect component, which should not depend on this component.
 * (it's done automatically by Circle during tag workflow)
 */
export const manifestsMap = {
  [AspectLoaderAspect.id]: AspectLoaderAspect,
  [AspectLoaderGraphqlBinderAspect.id]: AspectLoaderGraphqlBinderAspect,
  [CLIAspect.id]: CLIAspect,
  [DevFilesAspect.id]: DevFilesAspect,
  [WorkspaceAspect.id]: WorkspaceAspect,
  [WorkspaceUiBinderAspect.id]: WorkspaceUiBinderAspect,
  [WorkspaceConfigFilesAspect.id]: WorkspaceConfigFilesAspect,
  [InstallAspect.id]: InstallAspect,
  [ESLintAspect.id]: ESLintAspect,
  [PrettierAspect.id]: PrettierAspect,
  [CompilerAspect.id]: CompilerAspect,
  [LinterAspect.id]: LinterAspect,
  [FormatterAspect.id]: FormatterAspect,
  [ValidatorAspect.id]: ValidatorAspect,
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
  [EnvsGraphqlBinderAspect.id]: EnvsGraphqlBinderAspect,
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
  [ScopeUiBinderAspect.id]: ScopeUiBinderAspect,
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
  [CiAspect.id]: CiAspect,
  [RippleAspect.id]: RippleAspect,
  [ScriptsAspect.id]: ScriptsAspect,
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

