import { ExtensionManifest } from '@teambit/harmony';
import workspaceProvider from './workspace.provider';
import { ScopeExt } from '../scope';
import { ComponentFactoryExt } from '../component';
import { IsolatorExt } from '../isolator';
import { LoggerExt } from '../logger';
import { DependencyResolverExt } from '../dependency-resolver';
import { VariantsExt } from '../variants';
import { EXT_NAME } from './constants';

export default {
  name: EXT_NAME,
  dependencies: [ScopeExt, ComponentFactoryExt, IsolatorExt, DependencyResolverExt, VariantsExt, LoggerExt],
  provider: workspaceProvider,
  defineRuntime: 'browser'
} as ExtensionManifest;
