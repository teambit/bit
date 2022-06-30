import { Command, CommandOptions } from '@teambit/cli';
import { ComponentMain } from '@teambit/component';
import pMapSeries from 'p-map-series';
import { Logger } from '@teambit/logger';
import { APISchema } from '@teambit/semantics.entities.semantic-schema';
import { PATTERN_HELP } from '@teambit/legacy/dist/constants';
import type { SchemaMain } from './schema.main.runtime';

export class SchemaCommand implements Command {
  name = 'schema <pattern>';
  description = 'shows the API schema of a certain component.';
  extendedDescription = `${PATTERN_HELP('schema')}`;
  group = 'development';
  options = [['j', 'json', 'return the component data in json format']] as CommandOptions;

  constructor(private schema: SchemaMain, private component: ComponentMain, private logger: Logger) {}

  async report([pattern]) {
    const schemas = await this.getSchemas([pattern]);
    return schemas.map((schema) => schema.toStringPerType()).join('\n\n\n');
  }

  async json([pattern]) {
    const schemas = await this.getSchemas([pattern]);
    return schemas.map((schema) => schema.toObject());
  }

  private async getSchemas([pattern]): Promise<APISchema[]> {
    const host = this.component.getHost();
    const ids = await host.idsByPattern(pattern, true);
    const components = await host.getMany(ids);
    const longRunningLog = this.logger.createLongProcessLogger('generating schema', ids.length);
    const results = await pMapSeries(components, (component) => {
      longRunningLog.logProgress(component.id.toString());
      return this.schema.getSchema(component);
    });
    longRunningLog.end();
    return results;
  }
}
