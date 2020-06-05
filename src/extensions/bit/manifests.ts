import { BitCliExt } from '../cli';
import { CompileExt } from '../compile';
import { ComponentFactoryExt } from '../component';
// import { ComposerExt } from '../composer';
import { ConfigExt } from '../config';
import { CoreExt } from '../core';
import { CreateExt } from '../create';
// import { DependencyResolverExt } from '../dependency-resolver';
import { Environments } from '../environments';
import { FlowsExt } from '../flows';
// import { GitExt } from '../git';
import { ComponentGraphExt } from '../graph';
import { InsightsExt } from '../insights';
import { InstallExt } from '../install';
import { IsolatorExt } from '../isolator';
import { LoggerExt } from '../logger';
import { PackExt } from '../pack';
import { PackageManagerExt } from '../package-manager';
import { PaperExt } from '../paper';
import { React } from '../react';
import { ReporterExt } from '../reporter';
import { ScopeExtension } from '../scope';
import { TestExt } from '../test';
import { TesterExtension } from '../tester';
import { ReleasesExtension } from '../releases';
import { VariantsExt } from '../variants';
import { WatchExt } from '../watch';
import { WorkspaceExt } from '../workspace';

export const manifestsMap = {
  [BitCliExt.name]: BitCliExt,
  [WorkspaceExt.name]: WorkspaceExt,
  [CompileExt.name]: CompileExt,
  [ComponentFactoryExt.name]: ComponentFactoryExt,
  // [ComposerExt.name]: ComposerExt,
  [ConfigExt.name]: ConfigExt,
  [CoreExt.name]: CoreExt,
  [CreateExt.name]: CreateExt,
  // [DependencyResolverExt.name]: DependencyResolverExt,
  // TODO: take from the extension itself
  '@teambit/envs': Environments,
  [FlowsExt.name]: FlowsExt,
  // [GitExt.name]: GitExt,
  [ComponentGraphExt.name]: ComponentGraphExt,
  [InsightsExt.name]: InsightsExt,
  [InstallExt.name]: InstallExt,
  [IsolatorExt.name]: IsolatorExt,
  [LoggerExt.name]: LoggerExt,
  [PackExt.name]: PackExt,
  [PackageManagerExt.name]: PackageManagerExt,
  [PaperExt.name]: PaperExt,
  // TODO: take from the extension itself & change name to follow convention
  [React.name]: React,
  [ReporterExt.name]: ReporterExt,
  [ScopeExtension.name]: ScopeExtension,
  [TestExt.name]: TestExt,
  // TODO: take from the extension itself & change name to follow convention
  Tester: TesterExtension,
  // TODO: take from the extension itself & change name to follow convention
  [ReleasesExtension.name]: ReleasesExtension,
  [VariantsExt.name]: VariantsExt,
  [WatchExt.name]: WatchExt,
  [WorkspaceExt.name]: WorkspaceExt
};
