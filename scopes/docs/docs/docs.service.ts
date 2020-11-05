import { EnvService, ExecutionContext } from '@teambit/envs';

export class DocsService implements EnvService<any> {
  async run(context: ExecutionContext) {
    return context.env.getDocsTemplate();
  }
}
