import {
  BuildContext,
  BuiltTaskResult,
  BuildTask,
  TaskLocation,
  CAPSULE_ARTIFACTS_DIR,
  ComponentResult,
  ArtifactDefinition,
} from '@teambit/builder';
import { Logger } from '@teambit/logger';
import fs from 'fs-extra';
import pMapSeries from 'p-map-series';
import { join } from 'path';
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
      artifacts: [getSchemaArtifactDef()],
      componentsResults: schemaResult,
    };
  }
}

export function getSchemaArtifactPath() {
  return join(CAPSULE_ARTIFACTS_DIR, 'schema.json');
}

export function getSchemaArtifactDef() {
  const def: ArtifactDefinition = {
    name: SCHEMA_ARTIFACT_NAME,
    rootDir: CAPSULE_ARTIFACTS_DIR,
    globPatterns: ['*.json'],
  };

  return def;
}
