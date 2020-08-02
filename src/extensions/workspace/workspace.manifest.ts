import { ExtensionManifest, Slot } from '@teambit/harmony';
import workspaceProvider from './workspace.provider';
import { ScopeExtension } from '../scope';
import { ComponentExtension } from '../component';
import { IsolatorExtension } from '../isolator';
import { LoggerExtension } from '../logger';
import { DependencyResolverExtension } from '../dependency-resolver';
import { VariantsExt } from '../variants';
import { EXT_NAME } from './constants';
import { GraphQLExtension } from '../graphql';
import { CLIExtension } from '../cli';
import { UIExtension } from '../ui';
import { BundlerExtension } from '../bundler';
import { OnComponentLoad } from './on-component-load';
import { OnComponentChange } from './on-component-change';

export default {
  name: EXT_NAME,
  dependencies: [
    CLIExtension,
    ScopeExtension,
    ComponentExtension,
    IsolatorExtension,
    DependencyResolverExtension,
    VariantsExt,
    LoggerExtension,
    GraphQLExtension,
    UIExtension,
    BundlerExtension,
  ],
  slots: [Slot.withType<OnComponentLoad>(), Slot.withType<OnComponentChange>()],
  provider: workspaceProvider,
  defineRuntime: 'browser',
} as ExtensionManifest;
