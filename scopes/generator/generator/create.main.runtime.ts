import { CLIAspect, MainRuntime } from '@teambit/cli';
import { WorkspaceAspect } from '@teambit/workspace';

import { CreateAspect } from './create.aspect';
import { provideCreate } from './create.provider';

export const CreateMain = {
  runtime: MainRuntime,
  dependencies: [CLIAspect, WorkspaceAspect],
  provider: provideCreate,
};

CreateAspect.addRuntime(CreateMain);
