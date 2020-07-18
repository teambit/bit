import { ExtensionManifest } from '@teambit/harmony';
import workspaceProvider from './workspace.provider';
import { ScopeExtension } from '../scope';
import { ComponentExtension } from '../component';
import { IsolatorExtension } from '../isolator';
import { LoggerExt } from '../logger';
import { DependencyResolverExtension } from '../dependency-resolver';
import { VariantsExt } from '../variants';
import { EXT_NAME } from './constants';
import { GraphQLExtension } from '../graphql';
import { CLIExtension } from '../cli';
import { UIExtension } from '../ui';
import { BundlerExtension } from '../bundler';

export default {
  name: EXT_NAME,
  dependencies: [
    CLIExtension,
    ScopeExtension,
    ComponentExtension,
    IsolatorExtension,
    DependencyResolverExtension,
    VariantsExt,
    LoggerExt,
    GraphQLExtension,
    UIExtension,
    BundlerExtension,
  ],
  provider: workspaceProvider,
  defineRuntime: 'browser',
} as ExtensionManifest;
