import { ExtensionManifest } from '@teambit/harmony';
import { WorkspaceExt } from '../workspace';
import { ScopeExt } from '../scope';
import provideBit from './bit.provider';
import { ComposerExt } from '../composer';
import { InstallExt } from '../install';

import CompileExt from '../compile/compile.manifest';
import TestExt from '../test/test.manifest';
import { GraphExt } from '../graph';
import { CreateExt } from '../create';
import { FlowsExt } from '../flows';

export default {
  name: 'Bit',
  dependencies: [WorkspaceExt, ScopeExt, FlowsExt, CompileExt, TestExt, ComposerExt, GraphExt, InstallExt, CreateExt],
  provider: provideBit
} as ExtensionManifest;
