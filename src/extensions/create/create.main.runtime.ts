import { CreateAspect } from './create.aspect';
import { MainRuntime, CLIAspect } from '../cli/cli.aspect';
import { WorkspaceAspect } from '../workspace';
import { provideCreate } from './create.provider';

export const CreateMain = {
  name: '@teambit/create',
  runtime: MainRuntime,
  dependencies: [CLIAspect, WorkspaceAspect],
  provider: provideCreate,
};

CreateAspect.addRuntime(CreateMain);
