import { CLIExtension } from '../cli';
import { CompilerExtension } from '../compiler';
import { ComponentFactoryExt } from '../component';
import { ComponentGraphExt } from '../graph';
import { ConfigExt } from '../config';
import { CoreExt } from '../core';
import { CreateExt } from '../create';
import { DependencyResolverExtension } from '../dependency-resolver';
import { Environments } from '../environments';
import { FlowsExt } from '../flows';
// import { GitExt } from '../git';
import { InsightsExt } from '../insights';
import { IsolatorExtension } from '../isolator';
import { LoggerExtension } from '../logger';
import { PkgExtension } from '../pkg';
import { ReactExtension } from '../react';
import { ScopeExtension } from '../scope';
import { TesterExtension } from '../tester';
import { BuilderExtension } from '../builder';
import { VariantsExt } from '../variants';
import { GraphQLExtension } from '../graphql';
import { WorkspaceExt } from '../workspace';
import { UIExtension } from '../ui';
import { PreviewExtension } from '../preview/preview.extension';
import { DocsExtension } from '../docs/docs.extension';
import { StencilExtension } from '../stencil';
import { CompositionsExtension } from '../compositions';
import { DeprecationExtension } from '../deprecation';
import { DefaultEnvExtension } from '../default-env/default-env.extension';

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
  [ReactExtension.name]: ReactExtension,
  [StencilExtension.name]: StencilExtension,
  [ScopeExtension.id]: ScopeExtension,
  // TODO: take from the extension itself & change name to follow convention
  [TesterExtension.id]: TesterExtension,
  // TODO: take from the extension itself & change name to follow convention
  [BuilderExtension.id]: BuilderExtension,
  [VariantsExt.name]: VariantsExt,
  [WorkspaceExt.name]: WorkspaceExt,
  [DeprecationExtension.name]: DeprecationExtension,
  [DefaultEnvExtension.id]: DefaultEnvExtension,
};
