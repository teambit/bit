import { ExtensionManifest, Slot } from '@teambit/harmony';
import workspaceProvider from './workspace.provider';
import { ScopeExtension } from '@teambit/scope';
import { ComponentExtension } from '@teambit/component';
import { IsolatorExtension } from '@teambit/isolator';
import { LoggerExtension } from '@teambit/logger';
import { DependencyResolverExtension } from '@teambit/dependency-resolver';
import { VariantsExtension } from '@teambit/variants';
import { EXT_NAME } from './constants';
import { GraphQLExtension } from '@teambit/graphql';
import { CLIExtension } from '@teambit/cli';
import { UIExtension } from '@teambit/ui';
import { BundlerExtension } from '@teambit/bundler';
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
    VariantsExtension,
    LoggerExtension,
    GraphQLExtension,
    UIExtension,
    BundlerExtension,
  ],
  slots: [Slot.withType<OnComponentLoad>(), Slot.withType<OnComponentChange>()],
  provider: workspaceProvider,
  defineRuntime: 'browser',
} as ExtensionManifest;
