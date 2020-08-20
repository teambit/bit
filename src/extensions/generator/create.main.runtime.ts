import { CreateAspect } from './create.aspect';
import { MainRuntime, CLIAspect } from '../cli';
import { WorkspaceAspect } from '../workspace';
import { provideCreate } from './create.provider';

export const CreateMain = {
  runtime: MainRuntime,
  dependencies: [CLIAspect, WorkspaceAspect],
  provider: provideCreate,
};

CreateAspect.addRuntime(CreateMain);
