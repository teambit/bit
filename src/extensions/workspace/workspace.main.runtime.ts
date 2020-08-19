import { WorkspaceAspect } from './workspace.aspect';
import { MainRuntime } from '../cli/cli.aspect';
import { Slot } from '@teambit/harmony';
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
import { UiAspect } from '../ui';
import { BundlerAspect } from '../bundler';
import { OnComponentLoad } from './on-component-load';
import { OnComponentChange } from './on-component-change';

export default {
  name: EXT_NAME,
  dependencies: [
    CLIAspect,
    ScopeAspect,
    ComponentAspect,
    IsolatorAspect,
    DependencyResolverAspect,
    VariantsAspect,
    LoggerAspect,
    GraphqlAspect,
    UiAspect,
    BundlerAspect,
  ],
  slots: [Slot.withType<OnComponentLoad>(), Slot.withType<OnComponentChange>()],
  provider: workspaceProvider,
  defineRuntime: 'browser',
};

WorkspaceAspect.addRuntime(WorkspaceMain);
