import { CLIAspect } from '../cli';
import { CompilerAspect } from '../compiler';
import { ComponentAspect } from '../component';
import { GraphAspect } from '../graph';
import { ConfigAspect } from '../config';
import { CoreAspect } from '../core';
import { CreateAspect } from '../create';
import { DependencyResolverAspect } from '../dependency-resolver';
import { EnvsAspect } from '../environments';
import { FlowsAspect } from '../flows';
import { InsightsAspect } from '../insights';
import { IsolatorAspect } from '../isolator';
import { LoggerAspect } from '../logger';
import { PkgAspect } from '../pkg';
import { ReactAspect } from '../react';
import { ScopeAspect } from '../scope';
import { TesterAspect } from '../tester';
import { BuilderAspect } from '../builder';
import { VariantsAspect } from '../variants';
import { GraphqlAspect } from '../graphql';
import { PnpmAspect } from '../pnpm';
import { WorkspaceAspect } from '../workspace';
import { UIAspect } from '../ui';
import { PreviewAspect } from '../preview';
import { DocsAspect } from '../docs';
import { StencilAspect } from '../stencil';
import { CompositionsAspect } from '../compositions';
import { DeprecationAspect } from '../deprecation';
import { DefaultEnvAspect } from '../default-env';
import { ExpressAspect } from '../express';
import { AspectAspect } from '../aspect';

export const manifestsMap = {
  [CLIAspect.id]: CLIAspect,
  [ConfigAspect.id]: ConfigAspect,
  [WorkspaceAspect.id]: WorkspaceAspect,
  [CompilerAspect.id]: CompilerAspect,
  [ComponentAspect.id]: ComponentAspect,
  [PreviewAspect.id]: PreviewAspect,
  [ConfigAspect.id]: ConfigAspect,
  [DocsAspect.id]: DocsAspect,
  [CompositionsAspect.id]: CompositionsAspect,
  [GraphqlAspect.id]: GraphqlAspect,
  [PnpmAspect.id]: PnpmAspect,
  [UIAspect.id]: UIAspect,
  [CoreAspect.id]: CoreAspect,
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
  [DefaultEnvAspect.id]: DefaultEnvAspect,
  [ExpressAspect.id]: ExpressAspect,
  [AspectAspect.id]: AspectAspect,
};
