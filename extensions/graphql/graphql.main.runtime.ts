import { GraphQLModule } from '@graphql-modules/core';
import { MainRuntime } from '@teambit/cli';
import { Harmony, Slot, SlotRegistry } from '@teambit/harmony';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import express, { Express } from 'express';
import graphqlHTTP from 'express-graphql';
import getPort from 'get-port';
import { execute, subscribe } from 'graphql';
import { PubSub } from 'graphql-subscriptions';
import { createServer, Server } from 'http';
import httpProxy from 'http-proxy';
import { SubscriptionServer } from 'subscriptions-transport-ws';
import cors from 'cors';

import { GraphqlAspect } from './graphql.aspect';
import { Schema } from './schema';

export type GraphQLConfig = {
  port: number;
  subscriptionsPortRange: number[];
  subscriptionsPath: string;
};

export type SchemaSlot = SlotRegistry<Schema>;

export type GraphQLServerOptions = {
  schemaSlot?: SchemaSlot;
  app?: Express;
  graphiql?: boolean;
};

export class GraphqlMain {
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
    // app.use(cors());
    app.use(
      '/graphql',
      cors(),
      graphqlHTTP({
        schema: schema.schema,
        graphiql,
      })
    );

    const server = createServer(app);
    const subscriptionServerPort = await this.getPort(this.config.subscriptionsPortRange);
    const { port } = this.createSubscription(options, subscriptionServerPort);
    this.proxySubscription(server, port);

    return server;
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

  private async getPort(range: number[]) {
    const [from, to] = range;
    return getPort({ port: getPort.makeRange(from, to) });
  }

  /** create Subscription server with different port */

  private createSubscription(options: GraphQLServerOptions, port: number) {
    // Create WebSocket listener server
    const websocketServer = createServer((request, response) => {
      response.writeHead(404);
      response.end();
    });

    // Bind it to port and start listening
    websocketServer.listen(port, () =>
      this.logger.debug(`Websocket Server is now running on http://localhost:${port}`)
    );

    const schema = this.createRootModule(options.schemaSlot);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const subServer = new SubscriptionServer(
      {
        execute,
        subscribe,
        schema: schema.schema,
      },
      {
        server: websocketServer,
        path: this.config.subscriptionsPath,
      }
    );
    return { subServer, port };
  }
  /** proxy ws Subscription server to avoid conflict with different websocket connections */

  private proxySubscription(server: Server, port: number) {
    const proxServer = httpProxy.createProxyServer();
    const subscriptionsPath = this.config.subscriptionsPath;
    const logger = this.logger;
    server.on('upgrade', function (req, socket, head) {
      if (req.url === subscriptionsPath) {
        logger.debug(`proxy from ${req.url} to ${port}`);
        proxServer.ws(req, socket, head, { target: { host: 'localhost', port } });
      }
    });
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
    if (!extension) throw new Error(`aspect ${extensionId} was not found`);
    const deps = this.context.getDependencies(extension);
    const ids = deps.map((dep) => dep.id);

    // @ts-ignore check :TODO why types are breaking here.
    return Array.from(this.modules.entries())
      .map(([depId, module]) => {
        const dep = ids.includes(depId);
        if (!dep) return undefined;
        return module;
      })
      .filter((module) => !!module);
  }

  static slots = [Slot.withType<Schema>()];

  static defaultConfig = {
    port: 4000,
    subscriptionsPortRange: [2000, 2100],
    subscriptionsPath: '/subscriptions',
  };

  static runtime = MainRuntime;
  static dependencies = [LoggerAspect];

  static async provider(
    [loggerFactory]: [LoggerMain],
    config: GraphQLConfig,
    [moduleSlot]: [SchemaSlot],
    context: Harmony
  ) {
    const logger = loggerFactory.createLogger(GraphqlAspect.id);
    return new GraphqlMain(config, moduleSlot, context, new PubSub(), logger);
  }
}

GraphqlAspect.addRuntime(GraphqlMain);
