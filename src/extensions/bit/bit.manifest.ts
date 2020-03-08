import { WorkspaceExt } from '../workspace';
import { ScopeExt } from '../scope';
import provideBit from './bit.provider';
import { ScriptsExt } from '../scripts';
import { ComposerExt } from '../composer';
import { ReactExtension } from '../react/react.manifest';
import { InstallExt } from '../install';

import CompileExt from '../compile/compile.manifest';
import TestExt from '../test/test.manifest';
import { GraphExt } from '../graph';
import { CreateExt } from '../create';

export default {
  name: 'Bit',
  dependencies: [
    WorkspaceExt,
    ScopeExt,
    ScriptsExt,
    CompileExt,
    TestExt,
    ComposerExt,
    ReactExtension,
    GraphExt,
    InstallExt,
    CreateExt
  ],
  config: {},
  provider: provideBit
};
