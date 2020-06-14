import { ExtensionManifest } from '@teambit/harmony';
import workspaceProvider from './workspace.provider';
import { ScopeExtension } from '../scope';
import { ComponentFactoryExt } from '../component';
import { IsolatorExtension } from '../isolator';
import { LoggerExt } from '../logger';
import { DependencyResolverExtension } from '../dependency-resolver';
import { VariantsExt } from '../variants';
import { EXT_NAME } from './constants';
import { GraphQLExtension } from '../graphql';

export default {
  name: EXT_NAME,
  dependencies: [
    ScopeExtension,
    ComponentFactoryExt,
    IsolatorExtension,
    DependencyResolverExtension,
    VariantsExt,
    LoggerExt,
    GraphQLExtension
  ],
  provider: workspaceProvider,
  defineRuntime: 'browser'
} as ExtensionManifest;
