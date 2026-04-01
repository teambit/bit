import type { CLIMain } from '@teambit/cli';
import { MainRuntime, CLIAspect } from '@teambit/cli';
import type { Component, ComponentMain } from '@teambit/component';
import { ComponentAspect } from '@teambit/component';
import type { SlotRegistry } from '@teambit/harmony';
import { Slot } from '@teambit/harmony';
import type { GraphqlMain } from '@teambit/graphql';
import { GraphqlAspect } from '@teambit/graphql';
import type { EnvsMain } from '@teambit/envs';
import { EnvsAspect } from '@teambit/envs';
import type { Logger, LoggerMain } from '@teambit/logger';
import { LoggerAspect } from '@teambit/logger';
import type { PrettierConfigMutator } from '@teambit/defender.prettier.config-mutator';
import type { Export, SchemaNodeConstructor } from '@teambit/semantics.entities.semantic-schema';
import { APISchema, Schemas, SchemaRegistry } from '@teambit/semantics.entities.semantic-schema';
import type { BuilderMain } from '@teambit/builder';
import { BuilderAspect } from '@teambit/builder';
import type { Workspace } from '@teambit/workspace';
import { WorkspaceAspect } from '@teambit/workspace';
import type { ScopeMain } from '@teambit/scope';
import { ScopeAspect } from '@teambit/scope';
import type { Formatter } from '@teambit/formatter';
import type { SchemaNodeTransformer, SchemaTransformer } from '@teambit/typescript';
import { BuildStatus, CENTRAL_BIT_HUB_NAME, SYMPHONY_GRAPHQL } from '@teambit/legacy.constants';
import { Http } from '@teambit/scope.network';
import type { ImpactRule, APIDiffResult } from '@teambit/semantics.entities.semantic-schema-diff';
import { ImpactAssessor, DEFAULT_IMPACT_RULES, computeAPIDiff } from '@teambit/semantics.entities.semantic-schema-diff';
import type { Parser } from './parser';
import { SchemaAspect } from './schema.aspect';
import type { SchemaExtractor } from './schema-extractor';
import { SchemaCommand } from './schema.cmd';
import { schemaSchema } from './schema.graphql';
import { SchemaTask, SCHEMA_TASK_NAME } from './schema.task';
import { SchemaService } from './schema.service';

export type ParserSlot = SlotRegistry<Parser>;
export type ImpactRuleSlot = SlotRegistry<ImpactRule[]>;

export type SchemaConfig = {
  /**
   * default parser
   */
  defaultParser: string;
  /**
   * disable extracting schema
   */
  disabled?: boolean;
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

    /**
     * impact rules slot for customizing API diff impact assessment.
     */
    private impactRuleSlot: ImpactRuleSlot,

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

  /**
   * @deprecated use registerSchemaClasses instead
   * registerSchemaClasses is better for performance as it lazy-loads the schemas.
   */
  registerSchemaClass(schema: SchemaNodeConstructor) {
    SchemaRegistry.register(schema);
  }

  registerSchemaClasses(getSchemas: () => SchemaNodeConstructor[]) {
    SchemaRegistry.registerGetSchemas(getSchemas);
  }

  /**
   * parse a module into a component schema.
   */
  parseModule(path: string, content?: string): Export[] {
    const parsers = this.parserSlot.toArray();
    let maybeParser = parsers.find(([, parser]) => {
      const match = path.match(parser.extension);
      return match;
    });

    if (!maybeParser) {
      maybeParser = [this.config.defaultParser, this.getDefaultParser()];
    }

    const [, parser] = maybeParser;
    return parser.parseModule(path, content);
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
    contextPath?: string,
    skipInternals?: boolean,
    schemaTransformers?: SchemaTransformer[],
    apiTransformers?: SchemaNodeTransformer[],
    includeFiles?: string[]
  ): Promise<APISchema> {
    if (this.config.disabled) {
      return APISchema.empty(component.id as any);
    }

    if (alwaysRunExtractor || (this.workspace && component.buildStatus !== BuildStatus.Succeed)) {
      try {
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
        const schemaExtractor: SchemaExtractor = env.getSchemaExtractor(
          undefined,
          tsserverPath,
          contextPath,
          schemaTransformers,
          apiTransformers
        );

        const result = await schemaExtractor.extract(component, {
          formatter,
          tsserverPath,
          contextPath,
          skipInternals,
          includeFiles,
        });
        if (shouldDisposeResourcesOnceDone) schemaExtractor.dispose();

        return result;
      } catch (err) {
        if (alwaysRunExtractor) throw err;
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `failed extracting schema for ${component.id.toString()}, falling back to artifacts. extractor error: ${message}`,
          err
        );
      }
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
      return APISchema.empty(component.id as any);
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

  async getSchemaFromRemote(id: string): Promise<APISchema> {
    const isPattern = ['*', ',', '!', '$', ':'].some((char) => id.includes(char));
    if (isPattern) {
      throw new Error(`remote schema command doesn't support pattern matching. please use a specific component id`);
    }
    const getId = async () => {
      if (!id.startsWith('@')) return id;
      if (!this.workspace) throw new Error(`Please provide a component ID. The ${id} recognized as a package name.`);
      const compId = await this.workspace.resolveComponentIdFromPackageName(id, true);
      return compId.toString();
    };
    const compIdStr = await getId();
    const http = await Http.connect(SYMPHONY_GRAPHQL, CENTRAL_BIT_HUB_NAME);
    const response = await http.getSchema(compIdStr);
    return this.getSchemaFromObject(response);
  }

  /**
   * register a new parser.
   */
  registerParser(parser: Parser): SchemaMain {
    this.parserSlot.register(parser);
    return this;
  }

  async calcSchemaData(): Promise<{ disabled?: boolean }> {
    return {
      disabled: this.config.disabled,
    };
  }

  getSchemaData(component: Component) {
    return component.state.aspects.get(SchemaAspect.id)?.data;
  }

  /**
   * Register custom impact rules for API diff assessment.
   * Custom rules take priority over default rules.
   * This allows environments to customize what constitutes a breaking change.
   */
  registerImpactRules(rules: ImpactRule[]): void {
    this.impactRuleSlot.register(rules);
  }

  /**
   * Create an ImpactAssessor with default rules + any registered custom rules.
   */
  getImpactAssessor(): ImpactAssessor {
    const assessor = new ImpactAssessor();
    assessor.registerDefaultRules(DEFAULT_IMPACT_RULES);
    for (const rules of this.impactRuleSlot.values()) {
      assessor.registerRules(rules);
    }
    return assessor;
  }

  /**
   * Compute the semantic API diff between two component versions.
   */
  async computeAPIDiff(baseComp: Component, compareComp: Component): Promise<APIDiffResult | undefined> {
    try {
      const [baseSchema, compareSchema] = await Promise.all([this.getSchema(baseComp), this.getSchema(compareComp)]);
      const assessor = this.getImpactAssessor();
      return computeAPIDiff(baseSchema, compareSchema, assessor);
    } catch (err: any) {
      this.logger.warn(`failed computing API diff: ${err.message}`);
      return undefined;
    }
  }

  isSchemaTaskDisabled(component: Component) {
    return this.getSchemaData(component)?.disabled;
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
    ScopeAspect,
  ];
  static slots = [Slot.withType<Parser>(), Slot.withType<ImpactRule[]>()];

  static defaultConfig = {
    defaultParser: 'teambit.typescript/typescript',
    disabled: false,
  };

  static async provider(
    [envs, cli, component, graphql, loggerMain, builder, workspace, scope]: [
      EnvsMain,
      CLIMain,
      ComponentMain,
      GraphqlMain,
      LoggerMain,
      BuilderMain,
      Workspace,
      ScopeMain,
    ],
    config: SchemaConfig,
    [parserSlot, impactRuleSlot]: [ParserSlot, ImpactRuleSlot]
  ) {
    const logger = loggerMain.createLogger(SchemaAspect.id);
    const schema = new SchemaMain(parserSlot, impactRuleSlot, envs, config, builder, workspace, logger);
    const schemaTask = new SchemaTask(SchemaAspect.id, schema, logger);
    builder.registerBuildTasks([schemaTask]);
    cli.register(new SchemaCommand(schema, component, logger));
    graphql.register(() => schemaSchema(schema));
    envs.registerService(new SchemaService());
    if (workspace) {
      workspace.registerOnComponentLoad(async () => schema.calcSchemaData());
    }
    if (scope) {
      scope.registerOnCompAspectReCalc(async () => schema.calcSchemaData());
    }
    // register all default schema classes
    schema.registerSchemaClasses(() => Object.values(Schemas));

    return schema;
  }
}

SchemaAspect.addRuntime(SchemaMain);

export default SchemaMain;
