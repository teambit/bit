import { BitCliExt } from '../cli';
import { CompileExt } from '../compile';
import { ComponentFactoryExt } from '../component';
import { ComposerExt } from '../composer';
import { ConfigExt } from '../config';
import { CreateExt } from '../create';
// import { DependencyResolverExt } from '../dependency-resolver';
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
import { ReporterExt } from '../reporter';
import { ScopeExt } from '../scope';
import { TestExt } from '../test';
import { VariantsExt } from '../variants';
import { WatchExt } from '../watch';
import { WorkspaceExt } from '../workspace';

export const manifestsMap = {
  [BitCliExt.name]: BitCliExt,
  [WorkspaceExt.name]: WorkspaceExt,
  [CompileExt.name]: CompileExt,
  [ComponentFactoryExt.name]: ComponentFactoryExt,
  [ComposerExt.name]: ComposerExt,
  [ConfigExt.name]: ConfigExt,
  [CreateExt.name]: CreateExt,
  // [DependencyResolverExt.name]: DependencyResolverExt,
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
  [ReporterExt.name]: ReporterExt,
  [ScopeExt.name]: ScopeExt,
  [TestExt.name]: TestExt,
  [VariantsExt.name]: VariantsExt,
  [WatchExt.name]: WatchExt,
  [WorkspaceExt.name]: WorkspaceExt
};
