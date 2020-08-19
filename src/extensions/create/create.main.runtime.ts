import { ExtensionManifest } from '@teambit/harmony';
import { CreateAspect } from './create.aspect';
import { MainRuntime } from '../cli/cli.aspect';
import { WorkspaceAspect } from '../workspace';
import { provideCreate } from './create.provider';
import { CLIMain } from '../cli';

export default {
  name: '@teambit/create',
  runtime: MainRuntime,
  dependencies: [CLIMain, WorkspaceAspect],
  provider: provideCreate,
} as ExtensionManifest;

CreateAspect.addRuntime(CreateMain);
