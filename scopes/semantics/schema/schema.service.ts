import { EnvService, ExecutionContext } from '@teambit/environments';
// import { APISchema } from './schema';

export class SchemaService implements EnvService<{}> {
  name = '';

  async run(context: ExecutionContext) {
    return { errors: [], context };
  }
}
