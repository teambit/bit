import { EnvService, ExecutionContext } from '@teambit/envs';
// import { APISchema } from './schema';

export class SchemaService implements EnvService<{}> {
  name = 'schema';

  async run(context: ExecutionContext) {
    return { errors: [], context };
  }
}
