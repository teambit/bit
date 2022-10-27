import { BuildContext, BuiltTaskResult, BuildTask, TaskLocation, ComponentResult } from '@teambit/builder';
import { Logger } from '@teambit/logger';
import pMapSeries from 'p-map-series';
import { SchemaMain } from './schema.main.runtime';

export const SCHEMA_TASK_NAME = 'ExtractSchema';
export const SCHEMA_ARTIFACT_NAME = 'schema';

/**
 * extract and persist the component schema as a json file
 */
export class SchemaTask implements BuildTask {
  readonly name = SCHEMA_TASK_NAME;
  readonly location: TaskLocation = 'end';
  readonly description = 'extract api schema for a set of components';

  constructor(readonly aspectId: string, private schema: SchemaMain, private logger: Logger) {}

  async execute(context: BuildContext): Promise<BuiltTaskResult> {
    const startTime = Date.now();
    const capsules = context.capsuleNetwork.seedersCapsules;
    const schemaResult: ComponentResult[] = [];
    await pMapSeries(capsules, async (capsule) => {
      const component = capsule.component;
      try {
        const schema = await this.schema.getSchema(component);
        const schemaObj = schema.toObject();
        schemaResult.push({
          component,
          startTime,
          endTime: Date.now(),
          metadata: schemaObj,
        });
      } catch (e) {
        /**
         * @todo once schema extractor is more stable change this to an error
         */
        if (e instanceof Error) {
          schemaResult.push({
            component,
            startTime,
            endTime: Date.now(),
            warnings: [e.message],
          });
        }
      }
    });
    return {
      componentsResults: schemaResult,
    };
  }
}
