import { EnvService, ExecutionContext, Env, EnvContext, ServiceTransformationMap } from '@teambit/envs';
import { SchemaExtractor } from './schema-extractor';
// import { APISchema } from './schema';

type SchemaTransformationMap = ServiceTransformationMap  & {
  getSchemaExtractor: () => SchemaExtractor;
}
export class SchemaService implements EnvService<{}> {
  name = 'schema';

  async run(context: ExecutionContext) {
    return { errors: [], context };
  }

  transform(env: Env, context: EnvContext): SchemaTransformationMap | undefined {
    // Old env
    if (!env?.schemaExtractor) return undefined;
    return {
      getSchemaExtractor: env.schemaExtractor()(context),
    }
  }
}
