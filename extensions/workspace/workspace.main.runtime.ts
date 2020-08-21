import { Slot } from '@teambit/harmony';
import { WorkspaceAspect } from './workspace.aspect';
import { MainRuntime } from '@teambit/cli';
import workspaceProvider from './workspace.provider';
import { ScopeAspect } from '@teambit/scope';
import { ComponentAspect } from '@teambit/component';
import { IsolatorAspect } from '@teambit/isolator';
import { LoggerAspect } from '@teambit/logger';
import { DependencyResolverAspect } from '@teambit/dependency-resolver';
import { VariantsAspect } from '@teambit/variants';
import { EXT_NAME } from './constants';
import { GraphqlAspect } from '@teambit/graphql';
import { CLIAspect } from '@teambit/cli';
import { UIAspect } from '@teambit/ui';
import { BundlerAspect } from '@teambit/bundler';
import { OnComponentLoad } from './on-component-load';
import { OnComponentChange } from './on-component-change';
import { AspectLoaderAspect } from '@teambit/aspect-loader';
import { EnvsAspect } from '@teambit/environments';

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
    EnvsAspect,
  ],
  slots: [Slot.withType<OnComponentLoad>(), Slot.withType<OnComponentChange>()],
  provider: workspaceProvider,
  defineRuntime: 'browser',
};

WorkspaceAspect.addRuntime(WorkspaceMain);
