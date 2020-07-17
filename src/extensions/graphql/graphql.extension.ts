import { createServer } from 'http';
import express from 'express';
import cors from 'cors';
import { PubSub } from 'graphql-subscriptions';
import graphqlHTTP from 'express-graphql';
import { execute, subscribe } from 'graphql';
import { Slot, SlotRegistry, Harmony } from '@teambit/harmony';
import { GraphQLModule } from '@graphql-modules/core';
import { SubscriptionServer } from 'subscriptions-transport-ws';
import { Schema } from './schema';
import { LoggerExt, Logger, LogPublisher } from '../logger';

export type GraphQLConfig = {
  port: number;
  subscriptionsPort: number;
};

export type SchemaRegistry = SlotRegistry<Schema>;

export class GraphQLExtension {
  constructor(
    /**
     * extension config
     */
    readonly config: GraphQLConfig,

    /**
     * slot for registering graphql modules
     */
    private moduleSlot: SchemaRegistry,

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
    readonly logger: LogPublisher
  ) {}

  private modules = new Map<string, GraphQLModule>();

  /**
   * start a graphql server.
   */
  async listen(port?: number) {
    const schema = this.createRootModule();
    const serverPort = port || this.config.port;
    const subscriptionsPath = '/subscriptions';

    const app = express();
    app.use(cors());
    app.use(
      '/graphql',
      graphqlHTTP({
        schema: schema.schema,
        graphiql: true,
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
        path: subscriptionsPath,
      }
    );

    subscriptionServer.listen(serverPort, () => {
      this.logger.info(`API Server over HTTP is now running on http://localhost:${serverPort}`);
      this.logger.info(
        `API Server over web socket with subscriptions is now running on ws://localhost:${serverPort}/${subscriptionsPath}`
      );
    });
  }

  /**
   * get the root schema.
   */
  getSchema() {
    return this.createRootModule();
  }

  /**
   * register a new graphql module.
   */
  register(schema: Schema) {
    // const module = new GraphQLModule(schema);
    this.moduleSlot.register(schema);
    return this;
  }

  private createRootModule() {
    const modules = this.buildModules();

    return new GraphQLModule({
      imports: modules,
    });
  }

  private buildModules() {
    const schemaSlots = this.moduleSlot.toArray();
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
  };

  static dependencies = [LoggerExt];

  static async provider(
    [loggerFactory]: [Logger],
    config: GraphQLConfig,
    [moduleSlot]: [SchemaRegistry],
    context: Harmony
  ) {
    const logger = loggerFactory.createLogPublisher(GraphQLExtension.id);
    return new GraphQLExtension(config, moduleSlot, context, new PubSub(), logger);
  }
}
