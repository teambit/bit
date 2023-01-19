import { AspectAspect } from '@teambit/aspect/aspect.aspect';
import {AspectMain} from '@teambit/aspect/aspect.main.runtime';
import AspectLoaderAspect from '@teambit/aspect-loader/aspect-loader.aspect';
import {AspectLoaderMain} from '@teambit/aspect-loader/aspect-loader.main.runtime';
import { BuilderAspect } from '@teambit/builder/builder.aspect';
import {BuilderMain} from '@teambit/builder/builder.main.runtime';
import { BundlerAspect } from '@teambit/bundler/bundler.aspect';
import {BundlerMain} from '@teambit/bundler/bundler.main.runtime';
import { CacheAspect } from '@teambit/cache/cache.aspect';
import {CacheMain} from '@teambit/cache/cache.main.runtime';
import { CLIAspect } from '@teambit/cli/cli.aspect';
import {CLIMain} from '@teambit/cli/cli.main.runtime';
import { CompilerAspect } from '@teambit/compiler/compiler.aspect';
import {CompilerMain} from '@teambit/compiler/compiler.main.runtime';
import { ComponentAspect } from '@teambit/component/component.aspect';
import {ComponentMain} from '@teambit/component/component.main.runtime';
import { CompositionsAspect } from '@teambit/compositions/compositions.aspect';
import {CompositionsMain} from '@teambit/compositions/compositions.main.runtime';
import { ConfigAspect } from '@teambit/config/config.aspect';
import {ConfigMain} from '@teambit/config/config.main.runtime';
import { DependencyResolverAspect } from '@teambit/dependency-resolver/dependency-resolver.aspect';
import {DependencyResolverMain} from '@teambit/dependency-resolver/dependency-resolver.main.runtime';
import { DeprecationAspect } from '@teambit/deprecation/deprecation.aspect';
import {DeprecationMain} from '@teambit/deprecation/deprecation.main.runtime';
import { DocsAspect } from '@teambit/docs/docs.aspect';
import {DocsMain} from '@teambit/docs/docs.main.runtime';
import { EnvsAspect } from '@teambit/envs/environments.aspect';
import {EnvsMain} from '@teambit/envs/environments.main.runtime';
import { EnvAspect } from '@teambit/env/env.aspect';
import {EnvMain} from '@teambit/env/env.main.runtime';
import { ExpressAspect } from '@teambit/express/express.aspect';
import {ExpressMain} from '@teambit/express/express.main.runtime';
import { YarnAspect } from '@teambit/yarn/yarn.aspect';
import {YarnMain} from '@teambit/yarn/yarn.main.runtime';
import { GeneratorAspect } from '@teambit/generator/generator.aspect';
import {GeneratorMain} from '@teambit/generator/generator.main.runtime';
import { HarmonyUiAppAspect } from '@teambit/harmony-ui-app/harmony-ui-app.aspect';
import {HarmonyUiAppMain} from '@teambit/harmony-ui-app/harmony-ui-app.main.runtime';
import { GraphAspect } from '@teambit/graph/graph.aspect';
import {GraphMain} from '@teambit/graph/graph.main.runtime';
import { GraphqlAspect } from '@teambit/graphql/graphql.aspect';
import {GraphqlMain} from '@teambit/graphql/graphql.main.runtime';
import { InsightsAspect } from '@teambit/insights/insights.aspect';
import {InsightsMain} from '@teambit/insights/insights.main.runtime';
import { IsolatorAspect } from '@teambit/isolator/isolator.aspect';
import {IsolatorMain} from '@teambit/isolator/isolator.main.runtime';
import { JestAspect } from '@teambit/jest/jest.aspect';
import {JestMain} from '@teambit/jest/jest.main.runtime';
import { LoggerAspect } from '@teambit/logger/logger.aspect';
import {LoggerMain} from '@teambit/logger/logger.main.runtime';
import { NodeAspect } from '@teambit/node/node.aspect';
import {NodeMain} from '@teambit/node/node.main.runtime';
import { NotificationsAspect } from '@teambit/notifications/notifications.aspect';
import { PanelUiAspect } from '@teambit/panels/panel-ui.aspect';
import {PanelUIMain} from '@teambit/panels/panel-ui.main.runtime';
import { PkgAspect } from '@teambit/pkg/pkg.aspect';
import {PkgMain} from '@teambit/pkg/pkg.main.runtime';
import { PnpmAspect } from '@teambit/pnpm/pnpm.aspect';
import {PnpmMain} from '@teambit/pnpm/pnpm.main.runtime';
import { PreviewAspect } from '@teambit/preview/preview.aspect';
import {PreviewMain} from '@teambit/preview/preview.main.runtime';
import { ComponentSizerAspect } from '@teambit/component-sizer/component-sizer.aspect';
import {ComponentSizerMain} from '@teambit/component-sizer/component-sizer.main.runtime';
import { ReactAspect } from '@teambit/react/react.aspect';
import {ReactMain} from '@teambit/react/react.main.runtime';
import { ReactNativeAspect } from '@teambit/react-native/react-native.aspect';
import {ReactNativeMain} from '@teambit/react-native/react-native.main.runtime';
import { ReactRouterAspect } from '@teambit/react-router/react-router.aspect';
import { ReactElementsAspect } from '@teambit/react-elements/react-elements.aspect';
import {ReactElementsMain} from '@teambit/react-elements/react-elements.main.runtime';
import { ElementsAspect } from '@teambit/elements/elements.aspect';
import {ElementsMain} from '@teambit/elements/elements.main.runtime';
import { SchemaAspect } from '@teambit/schema/schema.aspect';
import {SchemaMain} from '@teambit/schema/schema.main.runtime';
import { PubsubAspect } from '@teambit/pubsub/pubsub.aspect';
import {PubsubMain} from '@teambit/pubsub/pubsub.main.runtime';
import { ScopeAspect } from '@teambit/scope/scope.aspect';
import {ScopeMain} from '@teambit/scope/scope.main.runtime';
// import { StencilAspect } from '@teambit/stencil/stencil.aspect';
// {impor}{ StencMain } from '@teambit/stencil/stencil.main.runtime';
import { TesterAspect } from '@teambit/tester/tester.aspect';
import {TesterMain} from '@teambit/tester/tester.main.runtime';
import { MultiTesterAspect } from '@teambit/multi-tester/multi-tester.aspect';
import {MultiTesterMain} from '@teambit/multi-tester/multi-tester.main.runtime';
import { TypescriptAspect } from '@teambit/typescript/typescript.aspect';
import {TypescriptMain} from '@teambit/typescript/typescript.main.runtime';
import { BabelAspect } from '@teambit/babel/babel.aspect';
import {BabelMain} from '@teambit/babel/babel.main.runtime';
import { UIAspect } from '@teambit/ui/ui.aspect';
import {UiMain} from '@teambit/ui/ui.main.runtime';
import { VariantsAspect } from '@teambit/variants/variants.aspect';
import {VariantsMain} from '@teambit/variants/variants.main.runtime';
import { WebpackAspect } from '@teambit/webpack/webpack.aspect';
import {WebpackMain} from '@teambit/webpack/webpack.main.runtime';
import { WorkspaceAspect } from '@teambit/workspace/workspace.aspect';
import {WorkspaceMain} from '@teambit/workspace/workspace.main.runtime';
import { InstallAspect } from '@teambit/install/install.aspect';
import {InstallMain} from '@teambit/install/install.main.runtime';
import { LinterAspect } from '@teambit/linter/linter.aspect';
import {LinterMain} from '@teambit/linter/linter.main.runtime';
import { FormatterAspect } from '@teambit/formatter/formatter.aspect';
import {FormatterMain} from '@teambit/formatter/formatter.main.runtime';
import { ChangelogAspect } from '@teambit/changelog/changelog.aspect';
import { CodeAspect } from '@teambit/code/code.aspect';
import { CommandBarAspect } from '@teambit/command-bar/command-bar.aspect';
import { SidebarAspect } from '@teambit/sidebar/sidebar.aspect';
import { ComponentTreeAspect } from '@teambit/component-tree/component-tree.aspect';
import { DevFilesAspect } from '@teambit/dev-files/dev-files.aspect';
import {DevFilesMain} from '@teambit/dev-files/dev-files.main.runtime';
import { ESLintAspect } from '@teambit/eslint/eslint.aspect';
import {ESLintMain} from '@teambit/eslint/eslint.main.runtime';
import { PrettierAspect } from '@teambit/prettier/prettier.aspect';
import {PrettierMain} from '@teambit/prettier/prettier.main.runtime';
import { SignAspect } from '@teambit/sign/sign.aspect';
import {SignMain} from '@teambit/sign/sign.main.runtime';
import { WorkerAspect } from '@teambit/worker/worker.aspect';
import {WorkerMain} from '@teambit/worker/worker.main.runtime';
import { GlobalConfigAspect } from '@teambit/global-config/global-config.aspect';
import {GlobalConfigMain} from '@teambit/global-config/global-config.main.runtime';
import { MultiCompilerAspect } from '@teambit/multi-compiler/multi-compiler.aspect';
import {MultiCompilerMain} from '@teambit/multi-compiler/multi-compiler.main.runtime';
import { MDXAspect } from '@teambit/mdx/mdx.aspect';
import {MDXMain} from '@teambit/mdx/mdx.main.runtime';
import { ReadmeAspect } from '@teambit/readme/readme.aspect';
import {ReadmeMain} from '@teambit/readme/readme.main.runtime';
import { ApplicationAspect } from '@teambit/application/application.aspect';
import {ApplicationMain} from '@teambit/application/application.main.runtime';
import { UpdateDependenciesAspect } from '@teambit/update-dependencies/update-dependencies.aspect';
import {UpdateDependenciesMain} from '@teambit/update-dependencies/update-dependencies.main.runtime';
import { ExportAspect } from '@teambit/export/export.aspect';
import {ExportMain} from '@teambit/export/export.main.runtime';
import { ImporterAspect } from '@teambit/importer/importer.aspect';
import {ImporterMain} from '@teambit/importer/importer.main.runtime';
import { EjectAspect } from '@teambit/eject/eject.aspect';
import {EjectMain} from '@teambit/eject/eject.main.runtime';
import { UserAgentAspect } from '@teambit/user-agent/user-agent.aspect';
import { HtmlAspect } from '@teambit/html/html.aspect';
import {HtmlMain} from '@teambit/html/html.main.runtime';
import { LanesAspect } from '@teambit/lanes/lanes.aspect';
import {LanesMain} from '@teambit/lanes/lanes.main.runtime';
import { ForkingAspect } from '@teambit/forking/forking.aspect';
import {ForkingMain} from '@teambit/forking/forking.main.runtime';
import { RenamingAspect } from '@teambit/renaming/renaming.aspect';
import {RenamingMain} from '@teambit/renaming/renaming.main.runtime';
import { ComponentLogAspect } from '@teambit/component-log/component-log.aspect';
import {ComponentLogMain} from '@teambit/component-log/component-log.main.runtime';
import { ClearCacheAspect } from '@teambit/clear-cache/clear-cache.aspect';
import {ClearCacheMain} from '@teambit/clear-cache/clear-cache.main.runtime';
import { DiagnosticAspect } from '@teambit/diagnostic/diagnostic.aspect';
import {DiagnosticMain} from '@teambit/diagnostic/diagnostic.main.runtime';
import { NewComponentHelperAspect } from '@teambit/new-component-helper/new-component-helper.aspect';
import {NewComponentHelperMain} from '@teambit/new-component-helper/new-component-helper.main.runtime';
import { MochaAspect } from '@teambit/mocha/mocha.aspect';
import {MochaMain} from '@teambit/mocha/mocha.main.runtime';
import { BitCustomAspectAspect } from '@teambit/bit-custom-aspect/bit-custom-aspect.aspect';
import {BitCustomAspectMain} from '@teambit/bit-custom-aspect/bit-custom-aspect.main.runtime';
import { CommunityAspect } from '@teambit/community/community.aspect';
import {CommunityMain} from '@teambit/community/community.main.runtime';
import { CloudAspect } from '@teambit/cloud/cloud.aspect';
import {CloudMain} from '@teambit/cloud/cloud.main.runtime';
import { StatusAspect } from '@teambit/status/status.aspect';
import {StatusMain} from '@teambit/status/status.main.runtime';
import { SnappingAspect } from '@teambit/snapping/snapping.aspect';
import {SnappingMain} from '@teambit/snapping/snapping.main.runtime';
import { MergingAspect } from '@teambit/merging/merging.aspect';
import {MergingMain} from '@teambit/merging/merging.main.runtime';
import { IssuesAspect } from '@teambit/issues/issues.aspect';
import {IssuesMain} from '@teambit/issues/issues.main.runtime';
import { RefactoringAspect } from '@teambit/refactoring/refactoring.aspect';
import {RefactoringMain} from '@teambit/refactoring/refactoring.main.runtime';
import { ComponentCompareAspect } from '@teambit/component-compare/component-compare.aspect';
import {ComponentCompareMain} from '@teambit/component-compare/component-compare.main.runtime';
import { ListerAspect } from '@teambit/lister/lister.aspect';
import {ListerMain} from '@teambit/lister/lister.main.runtime';
import { DependenciesAspect } from '@teambit/dependencies/dependencies.aspect';
import {DependenciesMain} from '@teambit/dependencies/dependencies.main.runtime';
import { RemoveAspect } from '@teambit/remove/remove.aspect';
import {RemoveMain} from '@teambit/remove/remove.main.runtime';
import { MergeLanesAspect } from '@teambit/merge-lanes/merge-lanes.aspect';
import {MergeLanesMain} from '@teambit/merge-lanes/merge-lanes.main.runtime';
import { CheckoutAspect } from '@teambit/checkout/checkout.aspect';
import {CheckoutMain} from '@teambit/checkout/checkout.main.runtime';
import { APIReferenceAspect } from '@teambit/api-reference/api-reference.aspect';
import { BitAspect } from './bit.aspect';
import {BitMain} from './bit.main.runtime';

export const manifestsMap = {
  [AspectLoaderAspect.id]: AspectLoaderAspect,
  [CLIAspect.id]: CLIAspect,
  [DevFilesAspect.id]: DevFilesAspect,
  [WorkspaceAspect.id]: WorkspaceAspect,
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
  [APIReferenceAspect.id]: APIReferenceAspect,
};

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
  [BitAspect.id]: BitMain,
}

console.log(runtimesMap)

export function isCoreAspect(id: string) {
  const _reserved = [BitAspect.id, ConfigAspect.id];
  if (_reserved.includes(id)) return true;
  return !!manifestsMap[id];
}

export function getAllCoreAspectsIds(): string[] {
  const _reserved = [BitAspect.id, ConfigAspect.id];
  return [...Object.keys(manifestsMap), ..._reserved];
}
