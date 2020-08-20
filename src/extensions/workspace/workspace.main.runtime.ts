import { Slot } from '@teambit/harmony';
import { WorkspaceAspect } from './workspace.aspect';
import { MainRuntime } from '../cli';
import workspaceProvider from './workspace.provider';
import { ScopeAspect } from '../scope';
import { ComponentAspect } from '../component';
import { IsolatorAspect } from '../isolator';
import { LoggerAspect } from '../logger';
import { DependencyResolverAspect } from '../dependency-resolver';
import { VariantsAspect } from '../variants';
import { EXT_NAME } from './constants';
import { GraphqlAspect } from '../graphql';
import { CLIAspect } from '../cli';
import { UIAspect } from '../ui';
import { BundlerAspect } from '../bundler';
import { OnComponentLoad } from './on-component-load';
import { OnComponentChange } from './on-component-change';
import { AspectLoaderAspect } from '../aspect-loader';

export const WorkspaceMain = {
  name: EXT_NAME,
  runtime: MainRuntime,
  dependencies: [
    CLIAspect,
    ScopeAspect,
    ComponentAspect,
    IsolatorAspect,
    DependencyResolverAspect,
    VariantsAspect,
    LoggerAspect,
    GraphqlAspect,
    UIAspect,
    BundlerAspect,
    AspectLoaderAspect,
  ],
  slots: [Slot.withType<OnComponentLoad>(), Slot.withType<OnComponentChange>()],
  provider: workspaceProvider,
  defineRuntime: 'browser',
};

WorkspaceAspect.addRuntime(WorkspaceMain);
