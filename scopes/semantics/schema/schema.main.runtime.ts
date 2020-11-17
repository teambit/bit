import { MainRuntime } from '@teambit/cli';
import { Component } from '@teambit/component';
import { Slot, SlotRegistry } from '@teambit/harmony';
// import { Workspace, WorkspaceAspect } from '@teambit/workspace';
import { EnvsAspect, EnvsMain } from '@teambit/envs';
import { Parser } from './parser';
import { SchemaAspect } from './schema.aspect';
import { Module } from './schemas';
import { SemanticSchema } from './semantic-schema';
import { SchemaExtractor } from './schema-extractor';

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
  parseModule(path: string): Module {
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

  /**
   * get a schema of a component.
   * @param component target component.
   */
  async getSchema(component: Component): Promise<SemanticSchema> {
    const env = this.envs.getEnv(component);
    const schemaExtractor: SchemaExtractor = env.env.getSchemaExtractor();
    await schemaExtractor.extract(component);

    return {
      exports: [],
    };
  }

  /**
   * register a new parser.
   */
  registerParser(parser: Parser): SchemaMain {
    this.parserSlot.register(parser);
    return this;
  }

  static runtime = MainRuntime;

  static dependencies = [EnvsAspect];

  static defaultConfig = {
    defaultParser: 'teambit.typescript/typescript',
  };

  static slots = [Slot.withType<Parser>()];

  static async provider([envs]: [EnvsMain], config: SchemaConfig, [parserSlot]: [ParserSlot]) {
    const schema = new SchemaMain(parserSlot, envs, config);
    // workspace.onComponentLoad(async (component) => {
    //   const apiSchema = await schema.getSchema(component);
    //   return {};
    // });

    return schema;
  }
}

SchemaAspect.addRuntime(SchemaMain);
