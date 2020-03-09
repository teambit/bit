import { ExtensionManifest } from '@teambit/harmony';
import { WorkspaceExt } from '../workspace';
import { ScopeExt } from '../scope';
import { IsolatorExt } from '../isolator';
import provideBit from './bit.provider';
import { ComposerExt } from '../composer';
import { InstallExt } from '../install';
import { Compile } from '../compile';
import TestExt from '../test/test.manifest';
import { GraphExt } from '../graph';
import { CreateExt } from '../create';
import { FlowsExt } from '../flows';

export default {
  name: 'Bit',
  dependencies: [
    WorkspaceExt,
    ScopeExt,
    IsolatorExt,
    FlowsExt,
    Compile,
    TestExt,
    ComposerExt,
    GraphExt,
    InstallExt,
    CreateExt
  ],
  provider: provideBit
} as ExtensionManifest;
