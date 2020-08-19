import { GraphqlAspect } from './graphql.aspect';
import { MainRuntime } from '../cli/cli.aspect';
import { createServer, Server } from 'http';
import express, { Express } from 'express';
import cors from 'cors';
import { PubSub } from 'graphql-subscriptions';
import graphqlHTTP from 'express-graphql';
import { execute, subscribe } from 'graphql';
import { Slot, SlotRegistry, Harmony } from '@teambit/harmony';
import { GraphQLModule } from '@graphql-modules/core';
import { SubscriptionServer } from 'subscriptions-transport-ws';
import { Schema } from './schema';
import { LoggerExtension, Logger } from '../logger';

export type GraphQLConfig = {
  port: number;
  subscriptionsPath: string;
};

export type SchemaSlot = SlotRegistry<Schema>;

export type GraphQLServerOptions = {
  schemaSlot?: SchemaSlot;
  app?: Express;
  graphiql?: boolean;
};

export class GraphQLExtension {
  constructor(
    /**
     * extension config
     */
    readonly config: GraphQLConfig,

    /**
     * slot for registering graphql modules
     */
    private moduleSlot: SchemaSlot,

    /**
     * harmony context.
     */
    private context: Harmony,

    /**
     * graphql pubsub. allows to emit events to clients.
     */
    readonly pubsub: PubSub,

    /**
     * logger extension.
     */
    readonly logger: Logger
  ) {}

  private modules = new Map<string, GraphQLModule>();

  async createServer(options: GraphQLServerOptions) {
    const { graphiql = true } = options;
    const schema = this.createRootModule(options.schemaSlot);

    // TODO: @guy please consider to refactor to express extension.
    const app = options.app || express();
    app.use(cors());
    app.use(
      '/graphql',
      graphqlHTTP({
        schema: schema.schema,
        graphiql,
      })
    );

    const subscriptionServer = createServer(app);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const subServer = new SubscriptionServer(
      {
        execute,
        subscribe,
        schema: schema.schema,
      },
      {
        server: subscriptionServer,
        path: this.config.subscriptionsPath,
      }
    );

    return subscriptionServer;
  }

  /**
   * start a graphql server.
   */
  async listen(port?: number, server?: Server, app?: Express) {
    const serverPort = port || this.config.port;
    const subServer = server || (await this.createServer({ app }));

    subServer.listen(serverPort, () => {
      this.logger.info(`API Server over HTTP is now running on http://localhost:${serverPort}`);
      this.logger.info(
        `API Server over web socket with subscriptions is now running on ws://localhost:${serverPort}/${this.config.subscriptionsPath}`
      );
    });
  }

  /**
   * register a new graphql module.
   */
  register(schema: Schema) {
    // const module = new GraphQLModule(schema);
    this.moduleSlot.register(schema);
    return this;
  }

  private createRootModule(schemaSlot?: SchemaSlot) {
    const modules = this.buildModules(schemaSlot);

    return new GraphQLModule({
      imports: modules,
    });
  }

  private buildModules(schemaSlot?: SchemaSlot) {
    const schemaSlots = schemaSlot ? schemaSlot.toArray() : this.moduleSlot.toArray();
    return schemaSlots.map(([extensionId, schema]) => {
      const moduleDeps = this.getModuleDependencies(extensionId);

      const module = new GraphQLModule({
        typeDefs: schema.typeDefs,
        resolvers: schema.resolvers,
        imports: moduleDeps,
      });

      this.modules.set(extensionId, module);

      return module;
    });
  }

  private getModuleDependencies(extensionId: string): GraphQLModule[] {
    const extension = this.context.extensions.get(extensionId);
    // @ts-ignore
    const deps = extension?.dependencies.map((ext) => ext.id || ext.name);

    // @ts-ignore check :TODO why types are breaking here.
    return Array.from(this.modules.entries())
      .map(([depId, module]) => {
        const dep = deps?.includes(depId);
        if (!dep) return undefined;
        return module;
      })
      .filter((module) => !!module);
  }

  static id = '@teambit/graphql';

  static slots = [Slot.withType<Schema>()];

  static defaultConfig = {
    port: 4000,
    subscriptionsPath: '/subscriptions',
  };

  static runtime = MainRuntime;
  static dependencies = [LoggerExtension];

  static async provider(
    [loggerFactory]: [LoggerExtension],
    config: GraphQLConfig,
    [moduleSlot]: [SchemaSlot],
    context: Harmony
  ) {
    const logger = loggerFactory.createLogger(GraphQLExtension.id);
    return new GraphQLExtension(config, moduleSlot, context, new PubSub(), logger);
  }
}

GraphqlAspect.addRuntime(GraphqlMain);
