import { CLIExtension } from '../cli';
import { CompileExt } from '../compiler';
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
import { LoggerExt } from '../logger';
import { PkgExtension } from '../pkg';
import { React } from '../react';
import { ReporterExt } from '../reporter';
import { ScopeExtension } from '../scope';
import { TesterExtension } from '../tester';
import { BuilderExtension } from '../builder';
import { VariantsExt } from '../variants';
import { GraphQLExtension } from '../graphql';
import { WatchExt } from '../watch';
import { WorkspaceExt } from '../workspace';
import { UIExtension } from '../ui';

export const manifestsMap = {
  [CLIExtension.name]: CLIExtension,
  [WorkspaceExt.name]: WorkspaceExt,
  [CompileExt.name]: CompileExt,
  [ComponentFactoryExt.id]: ComponentFactoryExt,
  [ConfigExt.name]: ConfigExt,
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
  [LoggerExt.name]: LoggerExt,
  [PkgExtension.id]: PkgExtension,
  // TODO: take from the extension itself & change name to follow convention
  [React.name]: React,
  [ReporterExt.name]: ReporterExt,
  [ScopeExtension.id]: ScopeExtension,
  // TODO: take from the extension itself & change name to follow convention
  [TesterExtension.id]: TesterExtension,
  // TODO: take from the extension itself & change name to follow convention
  [BuilderExtension.id]: BuilderExtension,
  [VariantsExt.name]: VariantsExt,
  [WatchExt.name]: WatchExt,
  [WorkspaceExt.name]: WorkspaceExt
};
