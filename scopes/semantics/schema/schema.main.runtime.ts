import { MainRuntime, CLIMain, CLIAspect } from '@teambit/cli';
import ComponentAspect, { Component, ComponentMain } from '@teambit/component';
import { Slot, SlotRegistry } from '@teambit/harmony';
import GraphqlAspect, { GraphqlMain } from '@teambit/graphql';
import { EnvsAspect, EnvsMain } from '@teambit/envs';
import { APISchema, Export } from '@teambit/semantics.entities.semantic-schema';
import { Parser } from './parser';
import { SchemaAspect } from './schema.aspect';
import { SchemaExtractor } from './schema-extractor';
import { SchemaCommand } from './schema.cmd';
import { schemaSchema } from './schema.graphql';

export type ParserSlot = SlotRegistry<Parser>;

export type SchemaConfig = {
  /**
   * default parser
   */
  defaultParser: string;
};

/**
 * extension for extracting component schemas.
 */
export class SchemaMain {
  constructor(
    /**
     * parsers slot.
     */
    private parserSlot: ParserSlot,

    private envs: EnvsMain,

    private config: SchemaConfig
  ) {}

  /**
   * get the default parser.
   */
  getDefaultParser(): Parser {
    return this.parserSlot.get(this.config.defaultParser) as Parser;
  }

  /**
   * parse a module into a component schema.
   */
  parseModule(path: string): Export[] {
    const parsers = this.parserSlot.toArray();
    let maybeParser = parsers.find(([, parser]) => {
      const match = path.match(parser.extension);
      return match;
    });

    if (!maybeParser) {
      maybeParser = [this.config.defaultParser, this.getDefaultParser()];
    }

    const [, parser] = maybeParser;
    return parser.parseModule(path);
  }

  getSchemaExtractor(component: Component) {
    const env = this.envs.getEnv(component).env;
    if (typeof env.getSchemaExtractor === 'undefined') {
      throw new Error(`No SchemaExtractor defined for ${env.name}`);
    }

    return env.getSchemaExtractor();
  }

  /**
   * get a schema of a component.
   * @param component target component.
   */
  async getSchema(component: Component): Promise<APISchema> {
    const env = this.envs.getEnv(component).env;
    if (typeof env.getSchemaExtractor === 'undefined') {
      throw new Error(`No SchemaExtractor defined for ${env.name}`);
    }
    const schemaExtractor: SchemaExtractor = env.getSchemaExtractor();
    return schemaExtractor.extract(component);
  }

  /**
   * register a new parser.
   */
  registerParser(parser: Parser): SchemaMain {
    this.parserSlot.register(parser);
    return this;
  }

  static runtime = MainRuntime;
  static dependencies = [EnvsAspect, CLIAspect, ComponentAspect, GraphqlAspect];
  static slots = [Slot.withType<Parser>()];

  static defaultConfig = {
    defaultParser: 'teambit.typescript/typescript',
  };

  static async provider(
    [envs, cli, component, graphql]: [EnvsMain, CLIMain, ComponentMain, GraphqlMain],
    config: SchemaConfig,
    [parserSlot]: [ParserSlot]
  ) {
    const schema = new SchemaMain(parserSlot, envs, config);
    cli.register(new SchemaCommand(schema, component));
    graphql.register(schemaSchema(schema));

    // workspace.onComponentLoad(async (component) => {
    //   const apiSchema = await schema.getSchema(component);
    //   return {};
    // });

    return schema;
  }
}

SchemaAspect.addRuntime(SchemaMain);
