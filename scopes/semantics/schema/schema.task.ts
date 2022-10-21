import {
  BuildContext,
  BuiltTaskResult,
  BuildTask,
  TaskLocation,
  CAPSULE_ARTIFACTS_DIR,
  ComponentResult,
} from '@teambit/builder';
import { Logger } from '@teambit/logger';
import fs from 'fs-extra';
import pMapSeries from 'p-map-series';
import { join } from 'path';
import { SchemaMain } from './schema.main.runtime';

/**
 * extract and persist the component schema as a json file
 */
export class SchemaTask implements BuildTask {
  readonly name = 'ExtractSchemaComponents';
  readonly location: TaskLocation = 'end';
  constructor(readonly aspectId: string, private schema: SchemaMain, private logger: Logger) {}

  async execute(context: BuildContext): Promise<BuiltTaskResult> {
    const startTime = Date.now();
    const capsules = context.capsuleNetwork.seedersCapsules;
    const schemaResult: ComponentResult[] = [];
    // persist schema json
    await pMapSeries(capsules, async (capsule) => {
      const component = capsule.component;
      const schema = await this.schema.getSchema(component);
      const schemaObj = schema.toObject();
      await fs.outputFile(join(capsule.path, getSchemaArtifactPath()), JSON.stringify(schemaObj, null, 2));
      schemaResult.push({
        component,
        startTime,
        endTime: Date.now(),
      });
    });

    return {
      artifacts: [{ name: 'schema', rootDir: CAPSULE_ARTIFACTS_DIR }],
      componentsResults: schemaResult,
    };
  }
}

export function getSchemaArtifactPath() {
  return join(CAPSULE_ARTIFACTS_DIR, 'schema.json');
}
