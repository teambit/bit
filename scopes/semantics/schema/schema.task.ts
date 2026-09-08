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

/** how many components one tsserver handles before it is restarted - see `extractForCapsules` */
const EXTRACTIONS_PER_TSSERVER = 20;

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
    try {
      await this.extractForCapsules(capsules, rootDir, schemaResult, startTime);
    } finally {
      // Release the tsserver the extractions shared. It holds this capsule root's whole TypeScript
      // project, and every remaining task of the build - a bundle per env among them - runs in this
      // same process, so leaving it alive charges its memory (and its background diagnostics) to
      // them. The next env's extraction starts its own server for its own capsule root.
      this.schema.disposeExtractorResources();
    }
    return {
      artifacts: [getSchemaArtifactDef()],
      componentsResults: schemaResult,
    };
  }

  private async extractForCapsules(
    capsules: BuildContext['capsuleNetwork']['seedersCapsules'],
    rootDir: string,
    schemaResult: ComponentResult[],
    startTime: number
  ): Promise<void> {
    let extractedSinceRestart = 0;
    await pMapSeries(capsules, async (capsule) => {
      const component = capsule.component;
      const isTaskDisabled = this.schema.isSchemaTaskDisabled(component);
      if (isTaskDisabled) return;
      // The tsserver the extractions share keeps every file it has opened, so its footprint grows
      // with each component and peaks at the end of a large env group - a `bit ci pr` build was
      // measured at 16373MB of a 16384MB container right here. Restarting it every so often bounds
      // that growth; the cost is one server startup per batch, against ~100 components in a group.
      if (extractedSinceRestart >= EXTRACTIONS_PER_TSSERVER) {
        this.schema.disposeExtractorResources();
        extractedSinceRestart = 0;
      }
      extractedSinceRestart += 1;
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
