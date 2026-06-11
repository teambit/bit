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
import type {
  ImpactRule,
  APIDiffResult,
  SchemaAvailability,
  SchemaUnavailableReason,
} from '@teambit/semantics.entities.semantic-schema-diff';
import { ImpactAssessor, DEFAULT_IMPACT_RULES, computeAPIDiff } from '@teambit/semantics.entities.semantic-schema-diff';
import type { Parser } from './parser';
import { SchemaAspect } from './schema.aspect';
import type { SchemaExtractor } from './schema-extractor';
import { SchemaCommand } from './schema.cmd';
import { SchemaDiffCommand } from './schema-diff.cmd';
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
     * impact rules slot — other aspects register custom rules via registerImpactRules().
     */
    private impactRuleSlot: ImpactRuleSlot,

    private envs: EnvsMain,

    private config: SchemaConfig,

    private builder: BuilderMain,

    private workspace: Workspace,

    private logger: Logger,

    private impactAssessor: ImpactAssessor
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
    const { schema } = await this.getSchemaWithAvailability(
      component,
      shouldDisposeResourcesOnceDone,
      alwaysRunExtractor,
      tsserverPath,
      contextPath,
      skipInternals,
      schemaTransformers,
      apiTransformers,
      includeFiles
    );
    return schema;
  }

  /**
   * like getSchema, but reports whether a real schema was obtained. an empty schema
   * with `available: false` means "no schema data exists for this version" — callers
   * (e.g. API diff) must not treat it as an empty API surface.
   */
  async getSchemaWithAvailability(
    component: Component,
    shouldDisposeResourcesOnceDone = false,
    alwaysRunExtractor = false,
    tsserverPath?: string,
    contextPath?: string,
    skipInternals?: boolean,
    schemaTransformers?: SchemaTransformer[],
    apiTransformers?: SchemaNodeTransformer[],
    includeFiles?: string[]
  ): Promise<{ schema: APISchema; availability: SchemaAvailability }> {
    if (this.config.disabled) {
      return { schema: APISchema.empty(component.id as any), availability: { available: false, reason: 'DISABLED' } };
    }

    // when extraction is attempted and fails, remember why so the artifact-fallback
    // miss below reports the actual cause rather than a generic NOT_BUILT.
    let extractionFailure: SchemaUnavailableReason | undefined;

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
          extractionFailure = 'NO_EXTRACTOR';
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

        return { schema: result, availability: { available: true } };
      } catch (err) {
        if (alwaysRunExtractor) throw err;
        extractionFailure = extractionFailure || 'FAILED';
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
      return {
        schema: APISchema.empty(component.id as any),
        availability: { available: false, reason: extractionFailure || 'NOT_BUILT' },
      };
    }

    const schemaJsonStr = schemaArtifact[0].contents.toString('utf-8');

    try {
      const schemaJson = JSON.parse(schemaJsonStr);
      return { schema: this.getSchemaFromObject(schemaJson), availability: { available: true } };
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
   * Get the ImpactAssessor with default + all registered custom rules from the slot.
   */
  getImpactAssessor(): ImpactAssessor {
    this.impactAssessor.registerRules(this.impactRuleSlot.values().flat());
    return this.impactAssessor;
  }

  /**
   * Compute the semantic API diff between two component versions.
   */
  /**
   * in-memory memo + single-flight for computed diffs. several consumers hit this for the
   * same immutable version pair (lane-diff status via component-compare, the compare UI's
   * apiDiff GraphQL field) — without this, a cold page load runs schema extraction twice
   * per pair. transient failures (FAILED availability / null) are never memoized.
   */
  private apiDiffMemo = new Map<string, APIDiffResult>();
  private apiDiffInflight = new Map<string, Promise<APIDiffResult | null>>();
  private static API_DIFF_MEMO_MAX = 500;

  async computeAPIDiff(baseComp: Component, compareComp: Component): Promise<APIDiffResult | null> {
    const memoKey = `${baseComp.id.toString()}|${compareComp.id.toString()}`;
    const cached = this.apiDiffMemo.get(memoKey);
    if (cached) return cached;
    const pending = this.apiDiffInflight.get(memoKey);
    if (pending) return pending;

    // un-built workspace components extract their schema from live source — the same id can
    // yield different schemas as the user edits, so those results must not be memoized.
    const immutable = baseComp.buildStatus === BuildStatus.Succeed && compareComp.buildStatus === BuildStatus.Succeed;

    const promise = this.doComputeAPIDiff(baseComp, compareComp)
      .then((result) => {
        const transient =
          !result ||
          (result.status !== 'COMPUTED' && (result.base.reason === 'FAILED' || result.compare.reason === 'FAILED'));
        if (!transient && immutable) {
          if (this.apiDiffMemo.size >= SchemaMain.API_DIFF_MEMO_MAX) {
            const firstKey = this.apiDiffMemo.keys().next().value;
            if (firstKey) this.apiDiffMemo.delete(firstKey);
          }
          this.apiDiffMemo.set(memoKey, result);
        }
        return result;
      })
      .finally(() => {
        this.apiDiffInflight.delete(memoKey);
      });
    this.apiDiffInflight.set(memoKey, promise);
    return promise;
  }

  private async doComputeAPIDiff(baseComp: Component, compareComp: Component): Promise<APIDiffResult | null> {
    try {
      // a side whose schema retrieval throws is reported as FAILED availability rather than
      // failing the whole diff — the result then carries an explicit status instead of null.
      const getSide = async (comp: Component) => {
        try {
          return await this.getSchemaWithAvailability(comp);
        } catch (err: any) {
          this.logger.warn(`failed getting schema for ${comp.id.toString()}: ${err.message}`);
          return {
            schema: APISchema.empty(comp.id as any),
            availability: { available: false, reason: 'FAILED' as SchemaUnavailableReason },
          };
        }
      };
      const [base, compare] = await Promise.all([getSide(baseComp), getSide(compareComp)]);
      const assessor = this.getImpactAssessor();
      return computeAPIDiff(base.schema, compare.schema, assessor, {
        base: base.availability,
        compare: compare.availability,
      });
    } catch (err: any) {
      this.logger.warn(`failed computing API diff: ${err.message}`);
      return null;
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
    const impactAssessor = new ImpactAssessor();
    impactAssessor.registerDefaultRules(DEFAULT_IMPACT_RULES);
    const schema = new SchemaMain(parserSlot, impactRuleSlot, envs, config, builder, workspace, logger, impactAssessor);
    const schemaTask = new SchemaTask(SchemaAspect.id, schema, logger);
    builder.registerBuildTasks([schemaTask]);
    const schemaCmd = new SchemaCommand(schema, component, logger);
    schemaCmd.commands = [new SchemaDiffCommand(schema, component, logger)];
    cli.register(schemaCmd);
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
