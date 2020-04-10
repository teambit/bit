import { ExtensionManifest } from '@teambit/harmony';
import { WorkspaceExt } from '../workspace';
import { Scope } from '../scope';
import provideBit from './bit.provider';
import { ComposerExt } from '../composer';
import { InstallExt } from '../install';

import CompileExt from '../compile/compile.manifest';
import TestExt from '../test/test.manifest';
import { ComponentGraphExt } from '../graph';
import { CreateExt } from '../create';
import { FlowsExt } from '../flows';
import { InsightsExt } from '../insights';
import { PackExt } from '../pack';

export default {
  name: 'Bit',
  dependencies: [
    WorkspaceExt,
    Scope,
    FlowsExt,
    PackExt,
    CompileExt,
    TestExt,
    ComposerExt,
    InstallExt,
    CreateExt,
    InsightsExt,
    ComponentGraphExt
  ],
  provider: provideBit
} as ExtensionManifest;
