import { AspectAspect } from '@teambit/aspect/aspect.aspect';
import AspectLoaderAspect from '@teambit/aspect-loader/aspect-loader.aspect';
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
import { ReactNativeAspect } from '@teambit/react-native/react-native.aspect';
import { ReactRouterAspect } from '@teambit/react-router/react-router.aspect';
import { ReactElementsAspect } from '@teambit/react-elements/react-elements.aspect';
import { ElementsAspect } from '@teambit/elements/elements.aspect';
import { SchemaAspect } from '@teambit/schema/schema.aspect';
import { PubsubAspect } from '@teambit/pubsub/pubsub.aspect';
import { ScopeAspect } from '@teambit/scope/scope.aspect';
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
import { SignAspect } from '@teambit/sign/sign.aspect';
import { WorkerAspect } from '@teambit/worker/worker.aspect';
import { GlobalConfigAspect } from '@teambit/global-config/global-config.aspect';
import { MultiCompilerAspect } from '@teambit/multi-compiler/multi-compiler.aspect';
import { MDXAspect } from '@teambit/mdx/mdx.aspect';
import { ReadmeAspect } from '@teambit/readme/readme.aspect';
import { ApplicationAspect } from '@teambit/application/application.aspect';
import { UpdateDependenciesAspect } from '@teambit/update-dependencies/update-dependencies.aspect';
import { ExportAspect } from '@teambit/export/export.aspect';
import { ImporterAspect } from '@teambit/importer/importer.aspect';
import { EjectAspect } from '@teambit/eject/eject.aspect';
import { UserAgentAspect } from '@teambit/user-agent/user-agent.aspect';
import { HtmlAspect } from '@teambit/html/html.aspect';
import { LanesAspect } from '@teambit/lanes/lanes.aspect';
import { ForkingAspect } from '@teambit/forking/forking.aspect';
import { RenamingAspect } from '@teambit/renaming/renaming.aspect';
import { ComponentLogAspect } from '@teambit/component-log/component-log.aspect';
import { ClearCacheAspect } from '@teambit/clear-cache/clear-cache.aspect';
import { DiagnosticAspect } from '@teambit/diagnostic/diagnostic.aspect';
import { NewComponentHelperAspect } from '@teambit/new-component-helper/new-component-helper.aspect';
import { MochaAspect } from '@teambit/mocha/mocha.aspect';
import { BitCustomAspectAspect } from '@teambit/bit-custom-aspect/bit-custom-aspect.aspect';
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

import { AspectMain } from '@teambit/aspect/aspect.main.runtime';
import { AspectLoaderMain } from '@teambit/aspect-loader/aspect-loader.main.runtime';
import { BuilderMain } from '@teambit/builder/builder.main.runtime';
import { BundlerMain } from '@teambit/bundler/bundler.main.runtime';
import { CacheMain } from '@teambit/cache/cache.main.runtime';
import { CLIMain } from '@teambit/cli/cli.main.runtime';
import { CompilerMain } from '@teambit/compiler/compiler.main.runtime';
import { ComponentMain } from '@teambit/component/component.main.runtime';
import { CompositionsMain } from '@teambit/compositions/compositions.main.runtime';
import { ConfigMain } from '@teambit/config/config.main.runtime';
import { DependencyResolverMain } from '@teambit/dependency-resolver/dependency-resolver.main.runtime';
import { DeprecationMain } from '@teambit/deprecation/deprecation.main.runtime';
import { DocsMain } from '@teambit/docs/docs.main.runtime';
import { EnvsMain } from '@teambit/envs/environments.main.runtime';
import { EnvMain } from '@teambit/env/env.main.runtime';
import { ExpressMain } from '@teambit/express/express.main.runtime';
import { YarnMain } from '@teambit/yarn/yarn.main.runtime';
import { GeneratorMain } from '@teambit/generator/generator.main.runtime';
import { HarmonyUiAppMain } from '@teambit/harmony-ui-app/harmony-ui-app.main.runtime';
import { GraphMain } from '@teambit/graph/graph.main.runtime';
import { GraphqlMain } from '@teambit/graphql/graphql.main.runtime';
import { InsightsMain } from '@teambit/insights/insights.main.runtime';
import { IsolatorMain } from '@teambit/isolator/isolator.main.runtime';
import { JestMain } from '@teambit/jest/jest.main.runtime';
import { LoggerMain } from '@teambit/logger/logger.main.runtime';
import { NodeMain } from '@teambit/node/node.main.runtime';
import { PanelUIMain } from '@teambit/panels/panel-ui.main.runtime';
import { PkgMain } from '@teambit/pkg/pkg.main.runtime';
import { PnpmMain } from '@teambit/pnpm/pnpm.main.runtime';
import { PreviewMain } from '@teambit/preview/preview.main.runtime';
import { ComponentSizerMain } from '@teambit/component-sizer/component-sizer.main.runtime';
import { ReactMain } from '@teambit/react/react.main.runtime';
import { ReactNativeMain } from '@teambit/react-native/react-native.main.runtime';
import { ReactElementsMain } from '@teambit/react-elements/react-elements.main.runtime';
import { ElementsMain } from '@teambit/elements/elements.main.runtime';
import { SchemaMain } from '@teambit/schema/schema.main.runtime';
import { PubsubMain } from '@teambit/pubsub/pubsub.main.runtime';
import { ScopeMain } from '@teambit/scope/scope.main.runtime';
import { TesterMain } from '@teambit/tester/tester.main.runtime';
import { MultiTesterMain } from '@teambit/multi-tester/multi-tester.main.runtime';
import { TypescriptMain } from '@teambit/typescript/typescript.main.runtime';
import { BabelMain } from '@teambit/babel/babel.main.runtime';
import { UiMain } from '@teambit/ui/ui.main.runtime';
import { VariantsMain } from '@teambit/variants/variants.main.runtime';
import { WebpackMain } from '@teambit/webpack/webpack.main.runtime';
import { WorkspaceMain } from '@teambit/workspace/workspace.main.runtime';
import { InstallMain } from '@teambit/install/install.main.runtime';
import { LinterMain } from '@teambit/linter/linter.main.runtime';
import { FormatterMain } from '@teambit/formatter/formatter.main.runtime';
import { DevFilesMain } from '@teambit/dev-files/dev-files.main.runtime';
import { ESLintMain } from '@teambit/eslint/eslint.main.runtime';
import { PrettierMain } from '@teambit/prettier/prettier.main.runtime';
import { SignMain } from '@teambit/sign/sign.main.runtime';
import { WorkerMain } from '@teambit/worker/worker.main.runtime';
import { GlobalConfigMain } from '@teambit/global-config/global-config.main.runtime';
import { MultiCompilerMain } from '@teambit/multi-compiler/multi-compiler.main.runtime';
import { MDXMain } from '@teambit/mdx/mdx.main.runtime';
import { ReadmeMain } from '@teambit/readme/readme.main.runtime';
import { ApplicationMain } from '@teambit/application/application.main.runtime';
import { UpdateDependenciesMain } from '@teambit/update-dependencies/update-dependencies.main.runtime';
import { ExportMain } from '@teambit/export/export.main.runtime';
import { ImporterMain } from '@teambit/importer/importer.main.runtime';
import { EjectMain } from '@teambit/eject/eject.main.runtime';
import { HtmlMain } from '@teambit/html/html.main.runtime';
import { LanesMain } from '@teambit/lanes/lanes.main.runtime';
import { ForkingMain } from '@teambit/forking/forking.main.runtime';
import { RenamingMain } from '@teambit/renaming/renaming.main.runtime';
import { ComponentLogMain } from '@teambit/component-log/component-log.main.runtime';
import { ClearCacheMain } from '@teambit/clear-cache/clear-cache.main.runtime';
import { DiagnosticMain } from '@teambit/diagnostic/diagnostic.main.runtime';
import { NewComponentHelperMain } from '@teambit/new-component-helper/new-component-helper.main.runtime';
import { MochaMain } from '@teambit/mocha/mocha.main.runtime';
import { BitCustomAspectMain } from '@teambit/bit-custom-aspect/bit-custom-aspect.main.runtime';
import { CommunityMain } from '@teambit/community/community.main.runtime';
import { CloudMain } from '@teambit/cloud/cloud.main.runtime';
import { StatusMain } from '@teambit/status/status.main.runtime';
import { SnappingMain } from '@teambit/snapping/snapping.main.runtime';
import { MergingMain } from '@teambit/merging/merging.main.runtime';
import { IssuesMain } from '@teambit/issues/issues.main.runtime';
import { RefactoringMain } from '@teambit/refactoring/refactoring.main.runtime';
import { ComponentCompareMain } from '@teambit/component-compare/component-compare.main.runtime';
import { ListerMain } from '@teambit/lister/lister.main.runtime';
import { DependenciesMain } from '@teambit/dependencies/dependencies.main.runtime';
import { RemoveMain } from '@teambit/remove/remove.main.runtime';
import { MergeLanesMain } from '@teambit/merge-lanes/merge-lanes.main.runtime';
import { CheckoutMain } from '@teambit/checkout/checkout.main.runtime';
import { ComponentWriterMain } from '@teambit/component-writer/component-writer.main.runtime';
import { TrackerMain } from '@teambit/tracker/tracker.main.runtime';
import { MoverMain } from '@teambit/mover/mover.main.runtime';
import { WatcherMain } from '@teambit/watcher/watcher.main.runtime';
import { WorkspaceConfigFilesMain } from '@teambit/workspace-config-files/workspace-config-files.main.runtime';
import { StashMain } from '@teambit/stash/stash.main.runtime';
import { GitMain } from '@teambit/git/git.main.runtime';
import { IpcEventsMain } from '@teambit/ipc-events/ipc-events.main.runtime';

import { BitMain } from './bit.main.runtime';
import { BitAspect } from './bit.aspect';

export function getManifestsMap() {
  const manifestsMap = {
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
    [ReactNativeAspect.id]: ReactNativeAspect,
    [ReactElementsAspect.id]: ReactElementsAspect,
    [ElementsAspect.id]: ElementsAspect,
    [WorkerAspect.id]: WorkerAspect,
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
    [SignAspect.id]: SignAspect,
    [UpdateDependenciesAspect.id]: UpdateDependenciesAspect,
    [ExportAspect.id]: ExportAspect,
    [ImporterAspect.id]: ImporterAspect,
    [HarmonyUiAppAspect.id]: HarmonyUiAppAspect,
    [UserAgentAspect.id]: UserAgentAspect,
    [ApplicationAspect.id]: ApplicationAspect,
    [EjectAspect.id]: EjectAspect,
    [HtmlAspect.id]: HtmlAspect,
    [LanesAspect.id]: LanesAspect,
    [ForkingAspect.id]: ForkingAspect,
    [RenamingAspect.id]: RenamingAspect,
    [NewComponentHelperAspect.id]: NewComponentHelperAspect,
    [ComponentLogAspect.id]: ComponentLogAspect,
    [ClearCacheAspect.id]: ClearCacheAspect,
    [MochaAspect.id]: MochaAspect,
    [BitCustomAspectAspect.id]: BitCustomAspectAspect,
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
  };
  return manifestsMap;
}

export const runtimesMap = {
  [AspectAspect.id]: AspectMain,
  [AspectLoaderAspect.id]: AspectLoaderMain,
  [BuilderAspect.id]: BuilderMain,
  [BundlerAspect.id]: BundlerMain,
  [CacheAspect.id]: CacheMain,
  [CLIAspect.id]: CLIMain,
  [CompilerAspect.id]: CompilerMain,
  [ComponentAspect.id]: ComponentMain,
  [CompositionsAspect.id]: CompositionsMain,
  [ConfigAspect.id]: ConfigMain,
  [DependencyResolverAspect.id]: DependencyResolverMain,
  [DeprecationAspect.id]: DeprecationMain,
  [DocsAspect.id]: DocsMain,
  [EnvsAspect.id]: EnvsMain,
  [EnvAspect.id]: EnvMain,
  [ExpressAspect.id]: ExpressMain,
  [YarnAspect.id]: YarnMain,
  [GeneratorAspect.id]: GeneratorMain,
  [HarmonyUiAppAspect.id]: HarmonyUiAppMain,
  [GraphAspect.id]: GraphMain,
  [GraphqlAspect.id]: GraphqlMain,
  [InsightsAspect.id]: InsightsMain,
  [IsolatorAspect.id]: IsolatorMain,
  [JestAspect.id]: JestMain,
  [LoggerAspect.id]: LoggerMain,
  [NodeAspect.id]: NodeMain,
  [PanelUiAspect.id]: PanelUIMain,
  [PkgAspect.id]: PkgMain,
  [PnpmAspect.id]: PnpmMain,
  [PreviewAspect.id]: PreviewMain,
  [ComponentSizerAspect.id]: ComponentSizerMain,
  [ReactAspect.id]: ReactMain,
  [ReactNativeAspect.id]: ReactNativeMain,
  [ReactElementsAspect.id]: ReactElementsMain,
  [ElementsAspect.id]: ElementsMain,
  [SchemaAspect.id]: SchemaMain,
  [PubsubAspect.id]: PubsubMain,
  [ScopeAspect.id]: ScopeMain,
  [TesterAspect.id]: TesterMain,
  [MultiTesterAspect.id]: MultiTesterMain,
  [TypescriptAspect.id]: TypescriptMain,
  [BabelAspect.id]: BabelMain,
  [UIAspect.id]: UiMain,
  [VariantsAspect.id]: VariantsMain,
  [WebpackAspect.id]: WebpackMain,
  [WorkspaceAspect.id]: WorkspaceMain,
  [InstallAspect.id]: InstallMain,
  [LinterAspect.id]: LinterMain,
  [FormatterAspect.id]: FormatterMain,
  [DevFilesAspect.id]: DevFilesMain,
  [ESLintAspect.id]: ESLintMain,
  [PrettierAspect.id]: PrettierMain,
  [SignAspect.id]: SignMain,
  [WorkerAspect.id]: WorkerMain,
  [GlobalConfigAspect.id]: GlobalConfigMain,
  [MultiCompilerAspect.id]: MultiCompilerMain,
  [MDXAspect.id]: MDXMain,
  [ReadmeAspect.id]: ReadmeMain,
  [ApplicationAspect.id]: ApplicationMain,
  [UpdateDependenciesAspect.id]: UpdateDependenciesMain,
  [ExportAspect.id]: ExportMain,
  [ImporterAspect.id]: ImporterMain,
  [EjectAspect.id]: EjectMain,
  [HtmlAspect.id]: HtmlMain,
  [LanesAspect.id]: LanesMain,
  [ForkingAspect.id]: ForkingMain,
  [RenamingAspect.id]: RenamingMain,
  [ComponentLogAspect.id]: ComponentLogMain,
  [ClearCacheAspect.id]: ClearCacheMain,
  [DiagnosticAspect.id]: DiagnosticMain,
  [NewComponentHelperAspect.id]: NewComponentHelperMain,
  [MochaAspect.id]: MochaMain,
  [BitCustomAspectAspect.id]: BitCustomAspectMain,
  [CommunityAspect.id]: CommunityMain,
  [CloudAspect.id]: CloudMain,
  [StatusAspect.id]: StatusMain,
  [SnappingAspect.id]: SnappingMain,
  [MergingAspect.id]: MergingMain,
  [IssuesAspect.id]: IssuesMain,
  [RefactoringAspect.id]: RefactoringMain,
  [ComponentCompareAspect.id]: ComponentCompareMain,
  [ListerAspect.id]: ListerMain,
  [DependenciesAspect.id]: DependenciesMain,
  [RemoveAspect.id]: RemoveMain,
  [MergeLanesAspect.id]: MergeLanesMain,
  [CheckoutAspect.id]: CheckoutMain,
  [ComponentWriterAspect.id]: ComponentWriterMain,
  [TrackerAspect.id]: TrackerMain,
  [MoverAspect.id]: MoverMain,
  [WatcherAspect.id]: WatcherMain,
  [WorkspaceConfigFilesAspect.id]: WorkspaceConfigFilesMain,
  [StashAspect.id]: StashMain,
  [GitAspect.id]: GitMain,
  [IpcEventsAspect.id]: IpcEventsMain,
  [BitAspect.id]: BitMain,
};

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
