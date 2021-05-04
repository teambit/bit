import { EnvService, ExecutionContext } from '@teambit/envs';

export class DocsService implements EnvService<any> {
  name = 'docs';

  async run(context: ExecutionContext) {
    return context.env.getDocsTemplate();
  }
}
