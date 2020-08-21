import { EnvService, ExecutionContext } from '@teambit/environments';

export class DocsService implements EnvService {
  async run(context: ExecutionContext) {
    return context.env.getDocsTemplate();
  }
}
