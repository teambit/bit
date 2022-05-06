import { Command, CommandOptions } from '@teambit/cli';
import { ComponentMain } from '@teambit/component';
import { ComponentNotFound } from '@teambit/scope';
import type { SchemaMain } from './schema.main.runtime';

export class SchemaCommand implements Command {
  name = 'schema <id>';
  description = 'shows the API schema of a certain component.';
  group = 'component';
  options = [['j', 'json', 'return the component data in json format']] as CommandOptions;

  constructor(private schema: SchemaMain, private component: ComponentMain) {}

  async report([idStr]) {
    const schema = await this.json([idStr]);

    return schema.toStringPerType();
  }

  async json([idStr]) {
    const host = this.component.getHost();
    const id = await host.resolveComponentId(idStr);
    const component = await host.get(id);
    if (!component) throw new ComponentNotFound(id);

    const schema = await this.schema.getSchema(component);

    return schema;
  }
}
