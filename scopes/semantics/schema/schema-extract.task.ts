import { BuildContext, BuildTask, BuiltTaskResult, TaskLocation } from '@teambit/builder';

export class SchemaExtract implements BuildTask {
  name = 'schema-extraction';
  description = 'extract api schema for a set of components';

  constructor(readonly aspectId: string) {}

  execute(context: BuildContext): Promise<BuiltTaskResult> {
    throw new Error('Method not implemented.');
  }
}
