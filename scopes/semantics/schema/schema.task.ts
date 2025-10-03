import type {
  BuildContext,
  BuiltTaskResult,
  BuildTask,
  TaskLocation,
  ComponentResult,
  ArtifactDefinition,
} from '@teambit/builder';
import { CAPSULE_ARTIFACTS_DIR } from '@teambit/builder';
import type { Logger } from '@teambit/logger';
import fs from 'fs-extra';
import pMapSeries from 'p-map-series';
import { join } from 'path';
import type { SchemaMain } from './schema.main.runtime';

export const SCHEMA_TASK_NAME = 'ExtractSchema';
export const SCHEMA_ARTIFACT_NAME = 'schema';

/**
 * extract and persist the component schema as a json file
 */
export class SchemaTask implements BuildTask {
  readonly name = SCHEMA_TASK_NAME;
  readonly location: TaskLocation = 'end';
  readonly description = 'extract api schema for a set of components';

  constructor(
    readonly aspectId: string,
    private schema: SchemaMain,
    private logger: Logger
  ) {}

  async execute(context: BuildContext): Promise<BuiltTaskResult> {
    const startTime = Date.now();
    const capsules = context.capsuleNetwork.seedersCapsules;
    const schemaResult: ComponentResult[] = [];
    const rootDir = context.capsuleNetwork.capsulesRootDir;
    await pMapSeries(capsules, async (capsule) => {
      const component = capsule.component;
      const isTaskDisabled = this.schema.isSchemaTaskDisabled(component);
      // const hasLiveControlsEnabled = this.schema.hasLiveControlsEnabled(component);
      if (isTaskDisabled) return;
      try {
        const schema = await this.schema.getSchema(component, false, true, rootDir, capsule.path);
        const schemaObj = schema.toObject();
        await fs.outputFile(join(capsule.path, getSchemaArtifactPath()), JSON.stringify(schemaObj, null, 2));
        schemaResult.push({
          component,
          startTime,
          endTime: Date.now(),
        });
      } catch (e) {
        this.logger.warn(`failed extracting schema for ${component.id.toString()}`);
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
      artifacts: [getSchemaArtifactDef()],
      componentsResults: schemaResult,
    };
  }
}

export function getSchemaArtifactPath() {
  return join(CAPSULE_ARTIFACTS_DIR, 'schema.json');
}

export function getSchemaArtifactDef(): ArtifactDefinition {
  const def: ArtifactDefinition = {
    name: SCHEMA_ARTIFACT_NAME,
    globPatterns: [getSchemaArtifactPath()],
  };

  return def;
}
