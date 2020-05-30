import { ExtensionManifest } from '@teambit/harmony';
import { WorkspaceExt } from '../workspace';
import { ScopeExt } from '../scope';
import provideBit from './bit.provider';
import { Environments } from '../environments';
import { InstallExt } from '../install';
import { CompileExt } from '../compile';
import { WatchExt } from '../watch';
import { TestExt } from '../test';
import { React } from '../react';
import { ComponentGraphExt } from '../graph';
import { CreateExt } from '../create';
import { FlowsExt } from '../flows';
import { InsightsExt } from '../insights';
import { PackExt } from '../pack';
import { TesterExtension } from '../tester';

export default {
  name: 'Bit',
  dependencies: [
    WorkspaceExt,
    TesterExtension,
    Environments,
    ScopeExt,
    FlowsExt,
    PackExt,
    CompileExt,
    WatchExt,
    TestExt,
    InstallExt,
    CreateExt,
    InsightsExt,
    React,
    ComponentGraphExt
  ],
  provider: provideBit
} as ExtensionManifest;
