import { mergeSchemas } from '@graphql-tools/schema';
import NoIntrospection from 'graphql-disable-introspection';
import { GraphQLModule } from '@graphql-modules/core';
import { MainRuntime } from '@teambit/cli';
import type { Harmony, SlotRegistry } from '@teambit/harmony';
import { Slot } from '@teambit/harmony';
import type { Logger, LoggerMain } from '@teambit/logger';
import { LoggerAspect } from '@teambit/logger';
import type { Express } from 'express';
import express from 'express';
import { graphqlHTTP, RequestInfo } from 'express-graphql';
import { Port } from '@teambit/toolbox.network.get-port';
import { execute, subscribe } from 'graphql';
import type { PubSubEngine } from 'graphql-subscriptions';
import { PubSub } from 'graphql-subscriptions';
import type { Server } from 'http';
import { createServer } from 'http';
import httpProxy from 'http-proxy';
import { SubscriptionServer } from 'subscriptions-transport-ws';
import cors from 'cors';
import type { GraphQLServer } from './graphql-server';
import { createRemoteSchemas } from './create-remote-schemas';
import { GraphqlAspect } from './graphql.aspect';
import type { Schema } from './schema';

export enum Verb {
  WRITE = 'write',
  READ = 'read',
}

export type GraphQLConfig = {
  port: number;
  subscriptionsPortRange: number[];
  subscriptionsPath: string;
  disableCors?: boolean;
};

export type GraphQLServerSlot = SlotRegistry<GraphQLServer>;

export type SchemaSlot = SlotRegistry<Schema | (() => Schema)>;

export type PubSubSlot = SlotRegistry<PubSubEngine>;

export type GraphQLServerOptions = {
  schemaSlot?: SchemaSlot;
  app?: Express;
  graphiql?: boolean;
  disableIntrospection?: boolean;
  remoteSchemas?: GraphQLServer[];
  subscriptionsPortRange?: number[];
  onWsConnect?: Function;
  customExecuteFn?: (args: any) => Promise<any>;
  customFormatErrorFn?: (args: any) => any;
  extensions?: (info: RequestInfo) => Promise<any>;
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
     * logger extension.
     */
    readonly logger: Logger,

    private graphQLServerSlot: GraphQLServerSlot,

    /**
     * graphql pubsub. allows to emit events to clients.
     */
    private pubSubSlot: PubSubSlot
  ) {}

  get pubsub(): PubSubEngine {
    const pubSubSlots = this.pubSubSlot.values();
    if (pubSubSlots.length) return pubSubSlots[0];
    return new PubSub();
  }

  private modules = new Map<string, GraphQLModule>();

  /**
   * returns the schema for a specific aspect by its id.
   */
  getSchema(aspectId: string): Schema | undefined {
    const schemaOrFunc = this.moduleSlot.get(aspectId);
    if (!schemaOrFunc) return undefined;
    const schema = typeof schemaOrFunc === 'function' ? schemaOrFunc() : schemaOrFunc;
    return schema;
  }

  get execute() {
    return execute;
  }

  /**
   * get multiple schema by aspect ids.
   * used by the cloud.
   */
  getSchemas(aspectIds: string[]): Schema[] {
    return this.moduleSlot
      .toArray()
      .filter(([aspectId]) => {
        return aspectIds.includes(aspectId);
      })
      .map(([, schemaOrFunc]) => {
        return typeof schemaOrFunc === 'function' ? schemaOrFunc() : schemaOrFunc;
      });
  }

  async createServer(options: GraphQLServerOptions) {
    const { graphiql = true, disableIntrospection } = options;
    const localSchema = this.createRootModule(options.schemaSlot);
    const remoteSchemas = await createRemoteSchemas(options.remoteSchemas || this.graphQLServerSlot.values());
    const schemas = [localSchema.schema].concat(remoteSchemas).filter((x) => x);
    const schema = mergeSchemas({
      schemas,
    });

    // TODO: @guy please consider to refactor to express extension.
    const app = options.app || express();
    if (!this.config.disableCors) {
      app.use(
        cors({
          origin(origin, callback) {
            callback(null, true);
          },
          credentials: true,
        })
      );
    }

    app.use(
      '/graphql',
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      graphqlHTTP((request, res, params) => ({
        extensions: options?.extensions,
        customExecuteFn: options.customExecuteFn,
        customFormatErrorFn: options.customFormatErrorFn
          ? options.customFormatErrorFn
          : (err) => {
              this.logger.error('graphql got an error during running the following query:', params);
              this.logger.error('graphql error ', err);
              return Object.assign(err, {
                // @ts-ignore
                ERR_CODE: err?.originalError?.errors?.[0].ERR_CODE || err.originalError?.constructor?.name,
                // @ts-ignore
                HTTP_CODE: err?.originalError?.errors?.[0].HTTP_CODE || err.originalError?.code,
              });
            },
        schema,
        rootValue: request,
        graphiql,
        validationRules: disableIntrospection ? [NoIntrospection] : undefined,
      }))
    );

    const server = createServer(app);
    const subscriptionsPort = options.subscriptionsPortRange || this.config.subscriptionsPortRange;
    const subscriptionServerPort = await this.getPort(subscriptionsPort);
    const { port } = await this.createSubscription(options, subscriptionServerPort);
    this.proxySubscription(server, port);

    return server;
  }

  /**
   * register a new graphql server.
   */
  registerServer(server: GraphQLServer) {
    this.graphQLServerSlot.register(server);
    return this;
  }

  /**
   * register a pubsub client
   */
  registerPubSub(pubsub: PubSubEngine) {
    const pubSubSlots = this.pubSubSlot.toArray();
    if (pubSubSlots.length) throw new Error('can not register more then one pubsub provider');
    this.pubSubSlot.register(pubsub);
    return this;
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
   * @param schema a function that returns Schema. avoid passing the Schema directly, it's supported only for backward
   * compatibility but really bad for performance. it pulls the entire graphql library.
   */
  register(schema: Schema | (() => Schema)) {
    // const module = new GraphQLModule(schema);
    this.moduleSlot.register(schema);
    return this;
  }

  private async getPort(range: number[]) {
    const [from, to] = range;
    return Port.getPort(from, to);
  }

  /** create Subscription server with different port */

  private async createSubscription(options: GraphQLServerOptions, port: number) {
    // Create WebSocket listener server
    const websocketServer = createServer((request, response) => {
      response.writeHead(404);
      response.end();
    });

    // Bind it to port and start listening
    websocketServer.listen(port, () =>
      this.logger.debug(`Websocket Server is now running on http://localhost:${port}`)
    );

    const localSchema = this.createRootModule(options.schemaSlot);
    const remoteSchemas = await createRemoteSchemas(options.remoteSchemas || this.graphQLServerSlot.values());
    const schemas = [localSchema.schema].concat(remoteSchemas).filter((x) => x);
    const schema = mergeSchemas({
      schemas,
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const subServer = new SubscriptionServer(
      {
        execute,
        subscribe,
        schema,
        onConnect: options.onWsConnect,
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
    server.on('upgrade', function (req, socket, head) {
      if (req.url === subscriptionsPath) {
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
    return schemaSlots.map(([extensionId, schemaOrFunc]) => {
      const schema = typeof schemaOrFunc === 'function' ? schemaOrFunc() : schemaOrFunc;
      const moduleDeps = this.getModuleDependencies(extensionId);

      const module = new GraphQLModule({
        typeDefs: schema.typeDefs,
        resolvers: schema.resolvers,
        schemaDirectives: schema.schemaDirectives,
        imports: moduleDeps,
        context: (session) => {
          return {
            ...session,
            verb: session?.headers?.['x-verb'] || Verb.READ,
          };
        },
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

    return Array.from(this.modules.entries())
      .map(([depId, module]) => {
        const dep = ids.includes(depId);
        if (!dep) return undefined;
        return module;
      })
      .filter((module) => !!module);
  }

  static slots = [Slot.withType<Schema>(), Slot.withType<GraphQLServer>(), Slot.withType<PubSubSlot>()];

  static defaultConfig = {
    port: 4000,
    subscriptionsPortRange: [2000, 2100],
    disableCors: false,
    subscriptionsPath: '/subscriptions',
  };

  static runtime = MainRuntime;
  static dependencies = [LoggerAspect];

  static async provider(
    [loggerFactory]: [LoggerMain],
    config: GraphQLConfig,
    [moduleSlot, graphQLServerSlot, pubSubSlot]: [SchemaSlot, GraphQLServerSlot, PubSubSlot],
    context: Harmony
  ) {
    const logger = loggerFactory.createLogger(GraphqlAspect.id);
    const graphqlMain = new GraphqlMain(config, moduleSlot, context, logger, graphQLServerSlot, pubSubSlot);
    graphqlMain.registerPubSub(new PubSub());
    return graphqlMain;
  }
}

GraphqlAspect.addRuntime(GraphqlMain);
