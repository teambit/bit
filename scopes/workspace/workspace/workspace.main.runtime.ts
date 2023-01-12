import { PubsubAspect } from '@teambit/pubsub';
import { AspectLoaderAspect } from '@teambit/aspect-loader';
import { BundlerAspect } from '@teambit/bundler';
import { CLIAspect, MainRuntime } from '@teambit/cli';
import { ComponentAspect } from '@teambit/component';
import { DependencyResolverAspect } from '@teambit/dependency-resolver';
import { EnvsAspect } from '@teambit/envs';
import { GraphqlAspect } from '@teambit/graphql';
import { Slot } from '@teambit/harmony';
import { IsolatorAspect } from '@teambit/isolator';
import { LoggerAspect } from '@teambit/logger';
import { ScopeAspect } from '@teambit/scope';
import { UIAspect } from '@teambit/ui';
import { VariantsAspect } from '@teambit/variants';

import { EXT_NAME } from './constants';
import {
  OnComponentAdd,
  OnComponentChange,
  OnComponentRemove,
  OnComponentLoad,
  OnMultipleComponentsAdd,
} from './on-component-events';
import { WorkspaceAspect } from './workspace.aspect';
import workspaceProvider, { OnAspectsResolve, OnPreWatch, OnRootAspectAdded } from './workspace.provider';

export const WorkspaceMain = {
  name: EXT_NAME,
  runtime: MainRuntime,
  dependencies: [
    PubsubAspect,
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
  slots: [
    Slot.withType<OnComponentLoad>(),
    Slot.withType<OnComponentChange>(),
    Slot.withType<OnComponentAdd>(),
    Slot.withType<OnComponentRemove>(),
    Slot.withType<OnMultipleComponentsAdd>(),
    Slot.withType<OnPreWatch>(),
    Slot.withType<OnAspectsResolve>(),
    Slot.withType<OnRootAspectAdded>(),
  ],
  provider: workspaceProvider,
  defineRuntime: 'browser',
};

WorkspaceAspect.addRuntime(WorkspaceMain);

export default WorkspaceMain;
