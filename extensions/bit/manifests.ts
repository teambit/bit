import { CLIExtension } from '@teambit/cli';
import { CompilerExtension } from '@teambit/compiler';
import { ComponentFactoryExt } from '@teambit/component';
import { ComponentGraphExt } from '@teambit/graph';
import { ConfigExt } from '@teambit/config';
import { CoreExt } from '@teambit/core';
import { CreateExt } from '@teambit/create';
import { DependencyResolverExtension } from '@teambit/dependency-resolver';
import { Environments } from '@teambit/environments';
import { FlowsExt } from '@teambit/flows';
// import { GitExt } from '../git';
import { InsightsExt } from '@teambit/insights';
import { IsolatorExtension } from '@teambit/isolator';
import { LoggerExtension } from '@teambit/logger';
import { PkgExtension } from '@teambit/pkg';
import { ReactExtension } from '@teambit/react';
import { ScopeExtension } from '@teambit/scope';
import { TesterExtension } from '@teambit/tester';
import { BuilderExtension } from '@teambit/builder';
import { VariantsExtension } from '@teambit/variants';
import { GraphQLExtension } from '@teambit/graphql';
import { PnpmExtension } from '@teambit/pnpm';
import { WorkspaceExt } from '@teambit/workspace';
import { UIExtension } from '@teambit/ui';
import { PreviewExtension } from '@teambit/preview/preview.extension';
import { DocsExtension } from '@teambit/docs/docs.extension';
import { StencilExtension } from '@teambit/stencil';
import { CompositionsExtension } from '@teambit/compositions';
import { DeprecationExtension } from '@teambit/deprecation';
import { DefaultEnvExtension } from '@teambit/default-env/default-env.extension';
import { ExpressExtension } from '@teambit/express';
import { AspectExtension } from '@teambit/aspect';

export const manifestsMap = {
  [CLIExtension.name]: CLIExtension,
  [WorkspaceExt.name]: WorkspaceExt,
  [CompilerExtension.id]: CompilerExtension,
  [ComponentFactoryExt.id]: ComponentFactoryExt,
  [PreviewExtension.name]: PreviewExtension,
  [ConfigExt.name]: ConfigExt,
  [DocsExtension.name]: DocsExtension,
  [CompositionsExtension.name]: CompositionsExtension,
  [GraphQLExtension.name]: GraphQLExtension,
  [PnpmExtension.id]: PnpmExtension,
  [UIExtension.name]: UIExtension,
  [CoreExt.name]: CoreExt,
  [CreateExt.name]: CreateExt,
  // [DependencyResolverExt.name]: DependencyResolverExt,
  [Environments.id]: Environments,
  [FlowsExt.name]: FlowsExt,
  // [GitExt.name]: GitExt,
  [ComponentGraphExt.name]: ComponentGraphExt,
  [DependencyResolverExtension.id]: DependencyResolverExtension,
  [InsightsExt.name]: InsightsExt,
  [IsolatorExtension.id]: IsolatorExtension,
  [LoggerExtension.id]: LoggerExtension,
  [PkgExtension.id]: PkgExtension,
  // TODO: take from the extension itself & change name to follow convention
  [ReactExtension.id]: ReactExtension,
  [StencilExtension.name]: StencilExtension,
  [ScopeExtension.id]: ScopeExtension,
  // TODO: take from the extension itself & change name to follow convention
  [TesterExtension.id]: TesterExtension,
  // TODO: take from the extension itself & change name to follow convention
  [BuilderExtension.id]: BuilderExtension,
  [VariantsExtension.id]: VariantsExtension,
  [WorkspaceExt.name]: WorkspaceExt,
  [DeprecationExtension.name]: DeprecationExtension,
  [DefaultEnvExtension.id]: DefaultEnvExtension,
  [ExpressExtension.id]: ExpressExtension,
  [AspectExtension.id]: AspectExtension,
};
