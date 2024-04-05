import { mergeSchemas } from '@graphql-tools/schema';
import { WebSocketServer } from 'ws';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { ApolloServerPluginLandingPageDisabled } from '@apollo/server/plugin/disabled';
import { useServer } from 'graphql-ws/lib/use/ws';
import { Module, createModule, createApplication, Application } from 'graphql-modules';
import { MainRuntime } from '@teambit/cli';
import { Harmony, Slot, SlotRegistry } from '@teambit/harmony';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import express, { Express } from 'express';
import { Port } from '@teambit/toolbox.network.get-port';
import { PubSubEngine, PubSub } from 'graphql-subscriptions';
import { createServer, Server } from 'http';
import httpProxy from 'http-proxy';
import compact from 'lodash.compact';
import cors from 'cors';
import { GraphQLServer } from './graphql-server';
import { createRemoteSchemas } from './create-remote-schemas';
import { GraphqlAspect } from './graphql.aspect';
import { Schema } from './schema';

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

export type SchemaSlot = SlotRegistry<Schema>;

export type PubSubSlot = SlotRegistry<PubSubEngine>;

export type GraphQLServerOptions = {
  schemaSlot?: SchemaSlot;
  app?: Express;
  graphiql?: boolean;
  disableIntrospection?: boolean;
  remoteSchemas?: GraphQLServer[];
  subscriptionsPortRange?: number[];
  onWsConnect?: Function;
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

  private modules = new Map<string, Module>();

  /**
   * returns the schema for a specific aspect by its id.
   */
  getSchema(aspectId: string) {
    return this.moduleSlot.get(aspectId);
  }

  /**
   * get multiple schema by aspect ids.
   */
  getSchemas(aspectIds: string[]) {
    return this.moduleSlot
      .toArray()
      .filter(([aspectId]) => {
        return aspectIds.includes(aspectId);
      })
      .map(([, schema]) => {
        return schema;
      });
  }

  // async createServer(options: GraphQLServerOptions) {
  //   const { graphiql = true, disableIntrospection } = options;
  //   const localSchema = this.createRootModule(options.schemaSlot);
  //   const remoteSchemas = await createRemoteSchemas(options.remoteSchemas || this.graphQLServerSlot.values());
  //   const schemas = [localSchema.schema].concat(remoteSchemas).filter((x) => x);
  //   const schema = mergeSchemas({
  //     schemas,
  //   });

  //   // TODO: @guy please consider to refactor to express extension.
  //   const app = options.app || express();
  //   if (!this.config.disableCors) {
  //     app.use(
  //       // @ts-ignore todo: it's not clear what's the issue.
  //       cors({
  //         origin(origin, callback) {
  //           callback(null, true);
  //         },
  //         credentials: true,
  //       })
  //     );
  //   }

  //   app.use(
  //     '/graphql',
  //     createGraphqlHandler({
  //       schema,
  //       validationRules: disableIntrospection
  //         ? [
  //             function NoIntrospection(context) {
  //               return {
  //                 Field(node) {
  //                   if (node.name.value === '__schema' || node.name.value === '__type') {
  //                     context.reportError(
  //                       new GraphQLError(
  //                         'GraphQL introspection is not allowed, but the query contained __schema or __type',
  //                         [node]
  //                       )
  //                     );
  //                   }
  //                 },
  //               };
  //             },
  //           ]
  //         : undefined,
  //       formatError: (err) => {
  //         this.logger.error('graphql error ', err);
  //         return Object.assign(err, {
  //           // @ts-ignore
  //           ERR_CODE: err?.originalError?.errors?.[0].ERR_CODE || err.originalError?.constructor?.name,
  //           // @ts-ignore
  //           HTTP_CODE: err?.originalError?.errors?.[0].HTTP_CODE || err.originalError?.code,
  //         });
  //       },
  //     })
  //   );

  //   // todo - add graphiql middleware for playground

  //   // app.use(
  //   //   '/graphql',
  //   //   // eslint-disable-next-line @typescript-eslint/no-misused-promises
  //   //   graphqlHTTP((request, res, params) => ({
  //   //     customFormatErrorFn: (err) => {
  //   //       this.logger.error('graphql got an error during running the following query:', params);
  //   //       this.logger.error('graphql error ', err);
  //   //       return Object.assign(err, {
  //   //         // @ts-ignore
  //   //         ERR_CODE: err?.originalError?.errors?.[0].ERR_CODE || err.originalError?.constructor?.name,
  //   //         // @ts-ignore
  //   //         HTTP_CODE: err?.originalError?.errors?.[0].HTTP_CODE || err.originalError?.code, s
  //   //       });
  //   //     },
  //   //     schema,
  //   //     rootValue: request,
  //   //     graphiql,
  //   //     validationRules: disableIntrospection ? [NoIntrospection] : undefined,
  //   //   }))

  //   const server = createServer(app);
  //   const subscriptionsPort = options.subscriptionsPortRange || this.config.subscriptionsPortRange;
  //   const subscriptionServerPort = await this.getPort(subscriptionsPort);
  //   const { port } = await this.createSubscription(options, subscriptionServerPort);
  //   this.proxySubscription(server, port);

  //   return server;
  // }

  async createServer(options: GraphQLServerOptions) {
    const { graphiql = true, disableIntrospection } = options;
    const app = options.app || express();
    const httpServer = createServer(app);

    const localSchema = this.createRootModule(options.schemaSlot);
    // const remoteSchemas = await createRemoteSchemas(options.remoteSchemas || this.graphQLServerSlot.values());
    // const schemas = [localSchema.schema].concat(remoteSchemas).filter((x) => x);
    const schemas = [localSchema.schema].concat([]).filter((x) => x);
    const mergedSchema = mergeSchemas({
      schemas,
    });
    // const gateway = new ApolloGateway({
    //   supergraphSdl: new IntrospectAndCompose({
    //     /**
    //      * include all the running services in the super-graph.
    //      */
    //     subgraphs: context.services.map((service) => {
    //       return {
    //         name: service.appName || '',
    //         url: service.url || `http://localhost:${service.port}/graphql`,
    //       };
    //     }),
    //   }),
    // });

    const apolloServer = new ApolloServer({
      gateway: {
        async load() {
          return { executor: localSchema.createApolloExecutor() };
        },
        onSchemaLoadOrUpdate(callback) {
          const apiSchema = { apiSchema: localSchema.schema } as any;
          callback(apiSchema);
          return () => {};
        },
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        async stop() {},
      },
      // schema: localSchema.schema,
      // schema: localSchema.schema,
      plugins: compact([
        ApolloServerPluginDrainHttpServer({ httpServer }),
        !graphiql ? ApolloServerPluginLandingPageDisabled() : null,
      ]),
      introspection: !disableIntrospection,
      formatError: (err) => {
        this.logger.error('graphql error ', err);
        return Object.assign(err, {
          // @ts-ignore
          ERR_CODE: err?.originalError?.errors?.[0].ERR_CODE || err.originalError?.constructor?.name,
          // @ts-ignore
          HTTP_CODE: err?.originalError?.errors?.[0].HTTP_CODE || err.originalError?.code,
        });
      },
    });

    await apolloServer.start();

    if (!this.config.disableCors) {
      app.use(
        // @ts-ignore todo: it's not clear what's the issue.
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
      expressMiddleware(apolloServer, {
        context: async ({ req }) => req,
      })
    );

    await this.createSubscription(mergedSchema, httpServer);
    this.proxySubscription(httpServer, this.config.port);
    return httpServer;
  }

  async createSubscription(schema, httpServer) {
    const websocketServer = new WebSocketServer({
      noServer: true, // Use the HTTP server for handling WebSocket connections
      path: this.config.subscriptionsPath,
    });

    httpServer.on('upgrade', (request, socket, head) => {
      // Only handle upgrades for the specific path, otherwise ignore
      if (request.url.startsWith(this.config.subscriptionsPath)) {
        websocketServer.handleUpgrade(request, socket, head, (websocket) => {
          websocketServer.emit('connection', websocket, request);
        });
      }
    });

    useServer(
      {
        schema,
        onConnect: (ctx) => {
          console.log('Connected!', ctx);
        },
        onDisconnect(ctx, code, reason) {
          console.log('Disconnected!', code, reason);
        },
      },
      websocketServer
    );
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
   */
  register(schema: Schema) {
    // const module = new GraphQLModule(schema);
    this.moduleSlot.register(schema);
    return this;
  }

  private async getPort(range: number[]) {
    const [from, to] = range;
    return Port.getPort(from, to);
  }

  /** create Subscription server with different port */

  // private async createSubscription(options: GraphQLServerOptions, port: number) {
  //   // Create WebSocket listener server
  //   const websocketServer = createServer((request, response) => {
  //     response.writeHead(404);
  //     response.end();
  //   });

  //   // Bind it to port and start listening
  //   websocketServer.listen(port, () =>
  //     this.logger.debug(`Websocket Server is now running on http://localhost:${port}`)
  //   );

  //   const localSchema = this.createRootModule(options.schemaSlot);
  //   const remoteSchemas = await createRemoteSchemas(options.remoteSchemas || this.graphQLServerSlot.values());
  //   const schemas = [localSchema.schema].concat(remoteSchemas).filter((x) => x);
  //   const schema = mergeSchemas({
  //     schemas,
  //   });

  //   // eslint-disable-next-line @typescript-eslint/no-unused-vars
  //   const subServer = SubscriptionServer.create(
  //     {
  //       execute,
  //       subscribe,
  //       schema,
  //       onConnect: options.onWsConnect,
  //     },
  //     {
  //       server: websocketServer,
  //       path: this.config.subscriptionsPath,
  //     }
  //   );
  //   return { subServer, port };
  // }
  /** proxy ws Subscription server to avoid conflict with different websocket connections */

  private proxySubscription(server: Server, port: number) {
    // const proxServer = httpProxy.createProxyServer();
    // const subscriptionsPath = this.config.subscriptionsPath;
    // server.on('upgrade', function (req, socket, head) {
    //   if (req.url === subscriptionsPath) {
    //     proxServer.ws(req, socket, head, { target: { host: 'localhost', port } });
    //   }
    // });
    const proxy = httpProxy.createProxyServer({ ws: true, changeOrigin: true });

    server.on('upgrade', (req, socket, head) => {
      // Check if the upgrade request is for the GraphQL subscriptions endpoint
      if (req.url?.startsWith(this.config.subscriptionsPath)) {
        proxy.ws(req, socket, head, {
          target: `ws://localhost:${port}${this.config.subscriptionsPath}`,
        });
      }
    });
  }

  private createRootModule(schemaSlot?: SchemaSlot): Application {
    const modules = this.buildModules(schemaSlot);

    return createApplication({ modules });
  }

  private buildModules(schemaSlot?: SchemaSlot) {
    const schemaSlots = schemaSlot ? schemaSlot.toArray() : this.moduleSlot.toArray();
    return schemaSlots.map(([extensionId, schema]) => {
      const module = createModule({
        id: extensionId,
        typeDefs: schema.typeDefs,
        resolvers: schema.resolvers,
      });

      this.modules.set(extensionId, module);

      return module;
    });
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
    return graphqlMain;
  }
}

GraphqlAspect.addRuntime(GraphqlMain);
