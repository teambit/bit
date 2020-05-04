import { ExtensionManifest } from '@teambit/harmony';
import { WorkspaceExt } from '@bit/bit.core.workspace';
import { ScopeExt } from '@bit/bit.core.scope';
import provideBit from './bit.provider';
import { ComposerExt } from '@bit/bit.core.composer';
import { InstallExt } from '@bit/bit.core.install';

import { CompileExt } from '@bit/bit.core.compile';
import { WatchExt } from '@bit/bit.core.watch';
import { TestExt } from '@bit/bit.core.test';
import { ComponentGraphExt } from '@bit/bit.core.graph';
import { CreateExt } from '@bit/bit.core.create';
import { FlowsExt } from '@bit/bit.core.flows';
import { InsightsExt } from '@bit/bit.core.insights';
import { PackExt } from '@bit/bit.core.pack';

export default {
  name: 'Bit',
  dependencies: [
    WorkspaceExt,
    ScopeExt,
    FlowsExt,
    PackExt,
    CompileExt,
    WatchExt,
    TestExt,
    ComposerExt,
    InstallExt,
    CreateExt,
    InsightsExt,
    ComponentGraphExt
  ],
  provider: provideBit
} as ExtensionManifest;
