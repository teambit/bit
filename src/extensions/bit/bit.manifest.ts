import { WorkspaceExt } from '../workspace';
import { ScopeExt } from '../scope';
import { IsolatorExt } from '../isolator';
import provideBit from './bit.provider';
import { ComposerExt } from '../composer';
// import { ReactExtension } from '../react/react.manifest';
import { InstallExt } from '../install';

import CompileExt from '../compile/compile.manifest';
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
    CompileExt,
    TestExt,
    ComposerExt,
    FlowsExt,
    // ReactExtension,
    GraphExt,
    InstallExt,
    CreateExt
  ],
  config: {},
  provider: provideBit
};
