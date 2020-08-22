import { CLIAspect } from '@teambit/cli';
import { CompilerAspect } from '@teambit/compiler';
import { ComponentAspect } from '@teambit/component';
import { GraphAspect } from '@teambit/graph';
import { CreateAspect } from '@teambit/generator';
import { DependencyResolverAspect } from '@teambit/dependency-resolver';
import { EnvsAspect } from '@teambit/environments';
import { FlowsAspect } from '@teambit/flows';
import { InsightsAspect } from '@teambit/insights';
import { IsolatorAspect } from '@teambit/isolator';
import { LoggerAspect } from '@teambit/logger';
import { PkgAspect } from '@teambit/pkg';
import { ReactAspect } from '@teambit/react';
import { ScopeAspect } from '@teambit/scope';
import { TesterAspect } from '@teambit/tester';
import { BuilderAspect } from '@teambit/builder';
import { VariantsAspect } from '@teambit/variants';
import { GraphqlAspect } from '@teambit/graphql';
import { PnpmAspect } from '@teambit/pnpm';
import { WorkspaceAspect } from '@teambit/workspace';
import { UIAspect } from '@teambit/ui';
import { PreviewAspect } from '@teambit/preview';
import { DocsAspect } from '@teambit/docs';
import { StencilAspect } from '@teambit/stencil';
import { CompositionsAspect } from '@teambit/compositions';
import { DeprecationAspect } from '@teambit/deprecation';
import { ExpressAspect } from '@teambit/express';
import { AspectAspect } from '@teambit/aspect';
import { WebpackAspect } from '@teambit/webpack';
import { SchemaAspect } from '@teambit/schema';
import { ConfigAspect } from '@teambit/config';
import AspectLoaderAspect from '@teambit/aspect-loader';
import { BitAspect } from './bit.aspect';
import { ReactRouterAspect } from '@teambit/react-router';
import { PanelUiAspect } from '@teambit/panels';
import { TypescriptAspect } from '@teambit/typescript';
import { NotificationsAspect } from '@teambit/notifications';
import { BundlerAspect } from '@teambit/bundler';
import { JestAspect } from '@teambit/jest';

export const manifestsMap = {
  [CLIAspect.id]: CLIAspect,
  [WorkspaceAspect.id]: WorkspaceAspect,
  [CompilerAspect.id]: CompilerAspect,
  [ComponentAspect.id]: ComponentAspect,
  [PreviewAspect.id]: PreviewAspect,
  [DocsAspect.id]: DocsAspect,
  [CompositionsAspect.id]: CompositionsAspect,
  [GraphqlAspect.id]: GraphqlAspect,
  [PnpmAspect.id]: PnpmAspect,
  [UIAspect.id]: UIAspect,
  [CreateAspect.id]: CreateAspect,
  [EnvsAspect.id]: EnvsAspect,
  [FlowsAspect.id]: FlowsAspect,
  [GraphAspect.id]: GraphAspect,
  [DependencyResolverAspect.id]: DependencyResolverAspect,
  [InsightsAspect.id]: InsightsAspect,
  [IsolatorAspect.id]: IsolatorAspect,
  [LoggerAspect.id]: LoggerAspect,
  [PkgAspect.id]: PkgAspect,
  [ReactAspect.id]: ReactAspect,
  [StencilAspect.id]: StencilAspect,
  [ScopeAspect.id]: ScopeAspect,
  [TesterAspect.id]: TesterAspect,
  [BuilderAspect.id]: BuilderAspect,
  [VariantsAspect.id]: VariantsAspect,
  [DeprecationAspect.id]: DeprecationAspect,
  [ExpressAspect.id]: ExpressAspect,
  [AspectAspect.id]: AspectAspect,
  [WebpackAspect.id]: WebpackAspect,
  [SchemaAspect.id]: SchemaAspect,
  [AspectLoaderAspect.id]: AspectLoaderAspect,
  [ReactRouterAspect.id]: ReactRouterAspect,
  [PanelUiAspect.id]: PanelUiAspect,
  [TypescriptAspect.id]: TypescriptAspect,
  [NotificationsAspect.id]: NotificationsAspect,
  [BundlerAspect.id]: BundlerAspect,
  [JestAspect.id]: JestAspect,
};

export function isCoreAspect(id: string) {
  const _reserved = [BitAspect.id, ConfigAspect.id];
  if (_reserved.includes(id)) return true;
  return !!manifestsMap[id];
}
