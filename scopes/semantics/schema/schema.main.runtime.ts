import { MainRuntime, CLIMain, CLIAspect } from '@teambit/cli';
import ComponentAspect, { Component, ComponentMain } from '@teambit/component';
import { Slot, SlotRegistry } from '@teambit/harmony';
import GraphqlAspect, { GraphqlMain } from '@teambit/graphql';
import { EnvsAspect, EnvsMain } from '@teambit/envs';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import { PrettierConfigMutator } from '@teambit/defender.prettier.config-mutator';
import {
  APISchema,
  Export,
  Schemas,
  SchemaNodeConstructor,
  SchemaRegistry,
} from '@teambit/semantics.entities.semantic-schema';
import { BuilderMain, BuilderAspect } from '@teambit/builder';
import { Workspace, WorkspaceAspect } from '@teambit/workspace';
import { Formatter } from '@teambit/formatter';
import { Parser } from './parser';
import { SchemaAspect } from './schema.aspect';
import { SchemaExtractor } from './schema-extractor';
import { SchemaCommand } from './schema.cmd';
import { schemaSchema } from './schema.graphql';
import { SchemaTask, SCHEMA_TASK_NAME } from './schema.task';
import { SchemaService } from './schema.service';

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

    private config: SchemaConfig,

    private builder: BuilderMain,

    private workspace: Workspace,

    private logger: Logger
  ) {}

  /**
   * get the default parser.
   */
  getDefaultParser(): Parser {
    return this.parserSlot.get(this.config.defaultParser) as Parser;
  }

  registerSchemaClass(schema: SchemaNodeConstructor) {
    SchemaRegistry.register(schema);
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

  getSchemaExtractor(component: Component, tsserverPath?: string, contextPath?: string): SchemaExtractor {
    const env = this.envs.getEnv(component).env;
    if (typeof env.getSchemaExtractor === 'undefined') {
      throw new Error(`No SchemaExtractor defined for ${env.name}`);
    }

    return env.getSchemaExtractor(undefined, tsserverPath, contextPath);
  }

  /**
   * get a schema of a component.
   * @param component target component.
   * @param shouldDisposeResourcesOnceDone for long-running processes, such as bit-start/bit-watch, this is not
   * relevant. for calling the API only to get a schema for one component, this is needed to ensure the ts-server is
   * not kept alive. otherwise, the process will never end.
   *
   */
  async getSchema(
    component: Component,
    shouldDisposeResourcesOnceDone = false,
    alwaysRunExtractor = false,
    tsserverPath?: string,
    contextPath?: string
  ): Promise<APISchema> {
    if (alwaysRunExtractor || this.workspace) {
      const env = this.envs.getEnv(component).env;
      // types need to be fixed
      const formatter: Formatter | undefined = env.getFormatter?.(null, [
        (config: PrettierConfigMutator) => {
          config.setKey('parser', 'typescript');
          return config;
        },
      ]);
      if (typeof env.getSchemaExtractor === 'undefined') {
        throw new Error(`No SchemaExtractor defined for ${env.name}`);
      }
      const schemaExtractor: SchemaExtractor = env.getSchemaExtractor(undefined, tsserverPath, contextPath);

      const result = await schemaExtractor.extract(component, { formatter, tsserverPath, contextPath });
      if (shouldDisposeResourcesOnceDone) schemaExtractor.dispose();

      return result;
    }

    // on scope get schema from builder api
    const schemaArtifact = await this.builder.getArtifactsVinylByAspectAndTaskName(
      component,
      SchemaAspect.id,
      SCHEMA_TASK_NAME
    );

    if (schemaArtifact.length === 0) {
      this.logger.debug(`no schema found for ${component.id.toString()}`);

      /**
       * return empty schema
       * when tag/snap without build
       * or backwards compatibility
       */
      return APISchema.empty(component.id);
    }

    const schemaJsonStr = schemaArtifact[0].contents.toString('utf-8');

    try {
      const schemaJson = JSON.parse(schemaJsonStr);
      return this.getSchemaFromObject(schemaJson);
    } catch (e) {
      if (e instanceof SyntaxError) {
        this.logger.error(e.message);
        throw new Error(`Invalid schema.json for ${component.id}`);
      }
      throw e;
    }
  }

  getSchemaFromObject(obj: Record<string, any>): APISchema {
    return APISchema.fromObject(obj);
  }

  /**
   * register a new parser.
   */
  registerParser(parser: Parser): SchemaMain {
    this.parserSlot.register(parser);
    return this;
  }

  static runtime = MainRuntime;
  static dependencies = [
    EnvsAspect,
    CLIAspect,
    ComponentAspect,
    GraphqlAspect,
    LoggerAspect,
    BuilderAspect,
    WorkspaceAspect,
  ];
  static slots = [Slot.withType<Parser>()];

  static defaultConfig = {
    defaultParser: 'teambit.typescript/typescript',
  };

  static async provider(
    [envs, cli, component, graphql, loggerMain, builder, workspace]: [
      EnvsMain,
      CLIMain,
      ComponentMain,
      GraphqlMain,
      LoggerMain,
      BuilderMain,
      Workspace
    ],
    config: SchemaConfig,
    [parserSlot]: [ParserSlot]
  ) {
    const logger = loggerMain.createLogger(SchemaAspect.id);
    const schema = new SchemaMain(parserSlot, envs, config, builder, workspace, logger);
    const schemaTask = new SchemaTask(SchemaAspect.id, schema, logger);
    builder.registerBuildTasks([schemaTask]);
    cli.register(new SchemaCommand(schema, component, logger));
    graphql.register(schemaSchema(schema));
    envs.registerService(new SchemaService());

    // register all default schema classes
    Object.values(Schemas).forEach((Schema) => {
      schema.registerSchemaClass(Schema);
    });

    return schema;
  }
}

SchemaAspect.addRuntime(SchemaMain);

export default SchemaMain;
