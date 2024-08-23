import { mergeSchemas } from '@graphql-tools/schema';
import { GraphQLUUID, GraphQLJSONObject } from 'graphql-scalars';
import { WebSocketServer } from 'ws';
import { ApolloServer, ApolloServerPlugin } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { ApolloServerPluginLandingPageDisabled } from '@apollo/server/plugin/disabled';
import { useServer } from 'graphql-ws/lib/use/ws';
import { GRAPHQL_TRANSPORT_WS_PROTOCOL } from 'graphql-ws';
import { Module, createModule, createApplication, Application } from 'graphql-modules';
import { MainRuntime } from '@teambit/cli';
import { Harmony, Slot, SlotRegistry } from '@teambit/harmony';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import express, { Express } from 'express';
import { PubSubEngine, PubSub } from 'graphql-subscriptions';
import { createServer, Server } from 'http';
import compact from 'lodash.compact';
import cors from 'cors';
import { GraphQLServer } from './graphql-server';
import { GraphQLSchema, subscribe as graphqlSubscribe, execute as graphqlExecute, isObjectType } from 'graphql';
import { createRemoteSchemas } from './create-remote-schemas';
import { GraphqlAspect } from './graphql.aspect';
import { Schema } from './schema';

export enum Verb {
  WRITE = 'write',
  READ = 'read',
}

export type Subscribe = typeof graphqlSubscribe;
export type Execute = typeof graphqlExecute;

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

  async createServer(options: GraphQLServerOptions) {
    const { graphiql = true, disableIntrospection } = options;
    const app = options.app || express();
    const httpServer = createServer(app);

    const remoteSchemas = await createRemoteSchemas(options.remoteSchemas || this.graphQLServerSlot.values());
    // const wrappedRemoteSchemas = remoteSchemas.map(this.wrapSchemaResolvers);
    const wrappedRemoteSchemas = remoteSchemas;

    const application = this.createRootModule(options.schemaSlot);
    // const wrappedLocalSchema = this.wrapSchemaResolvers(application.schema);
    const wrappedLocalSchema = application.schema;
    const subscribe = application.createSubscription();
    const execute = application.createExecution();

    const schemas = compact(
      [wrappedLocalSchema].concat(wrappedRemoteSchemas).filter((x) => {
        return Boolean(x && (x.getQueryType() || x.getMutationType() || x.getSubscriptionType()));
      })
    );

    // if there is no schema with at least a query, mutation or subscription, return the http server without spinning up a graphql server
    if (schemas.length === 0) {
      return httpServer;
    }

    const mergedSchema = mergeSchemas({
      schemas,
    });

    const subscriptionServerCleanup = await this.createSubscription(
      mergedSchema,
      httpServer,
      options,
      subscribe,
      execute
    );

    const apolloServer = new ApolloServer({
      gateway: {
        async load() {
          return { executor: application.createApolloExecutor() };
        },
        onSchemaLoadOrUpdate(callback) {
          const apiSchema = { apiSchema: mergedSchema } as any;
          callback(apiSchema);
          return () => {};
        },
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        async stop() {},
      },
      plugins: compact([
        ApolloServerPluginDrainHttpServer({ httpServer }),
        !graphiql ? ApolloServerPluginLandingPageDisabled() : null,
        {
          async serverWillStart() {
            return {
              async drainServer() {
                await subscriptionServerCleanup.dispose();
              },
            };
          },
        },
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
        context: async ({ req }) => ({ req }),
      })
    );

    return httpServer;
  }

  async createSubscription(
    schema: GraphQLSchema,
    httpServer: Server,
    options: GraphQLServerOptions,
    subscribe: Subscribe,
    execute: Execute
  ) {
    const websocketServer = new WebSocketServer({
      noServer: true,
      path: this.config.subscriptionsPath,
    });

    httpServer.on('upgrade', (request, socket, head) => {
      if (request.url?.startsWith(this.config.subscriptionsPath)) {
        const protocols = request.headers['sec-websocket-protocol'];
        if (protocols?.includes(GRAPHQL_TRANSPORT_WS_PROTOCOL)) {
          websocketServer.handleUpgrade(request, socket, head, (websocket) => {
            websocketServer.emit('connection', websocket, request);
          });
        }
      }
    });

    return useServer(
      {
        schema,
        subscribe,
        execute,
        onConnect: () => {
          options?.onWsConnect?.();
        },
        context: async (ctx, msgs, args) => {
          return {
            ctx,
            msgs,
            args,
          };
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

  private createRootModule(schemaSlot?: SchemaSlot): Application {
    const modules = this.buildModules(schemaSlot);
    return createApplication({
      modules,
    });
  }

  get scalars() {
    return {
      GraphQLUUID,
      GraphQLJSONObject,
    };
  }

  wrapResolver = (resolver) => {
    return (_source, args, context, info) => {
      return resolver(context, args, context, info);
    };
  };

  wrapSchemaResolvers = (schema: GraphQLSchema) => {
    const typeMap = schema.getTypeMap();
    Object.keys(typeMap).forEach((typeName) => {
      const type = typeMap[typeName];

      // Check if the type is an object type (e.g., Query, Mutation, Subscription)
      if (isObjectType(type)) {
        const fields = type.getFields();
        Object.keys(fields).forEach((fieldName) => {
          const field = fields[fieldName];

          // Only wrap if the field has a resolve function
          if (typeof field.resolve === 'function') {
            field.resolve = this.wrapResolver(field.resolve);
          }
        });
      }
    });
    return schema;
  };

  private wrapResolvers = (resolvers: any) => {
    const wrappedResolvers = {};
    for (const [typeName, fields] of Object.entries(resolvers) as any) {
      // Only wrap resolvers for Query, Mutation, and Subscription types
      if (typeName === 'Query' || typeName === 'Mutation' || typeName === 'Subscription') {
        wrappedResolvers[typeName] = {};
        for (const [fieldName, resolver] of Object.entries(fields)) {
          if (typeof resolver === 'function') {
            wrappedResolvers[typeName][fieldName] = this.wrapResolver(resolver);
          }
        }
      } else {
        // Copy the scalar and other non-object type resolvers as is
        wrappedResolvers[typeName] = fields;
      }
    }
    return wrappedResolvers;
  };

  private buildModules(schemaSlot?: SchemaSlot) {
    const schemaSlots = schemaSlot ? schemaSlot.toArray() : this.moduleSlot.toArray();
    return schemaSlots.map(([extensionId, schema]) => {
      const wrappedResolvers = this.wrapResolvers(schema.resolvers);

      console.log(
        '🚀 ~ file: graphql.main.runtime.ts:398 ~ GraphqlMain ~ returnschemaSlots.map ~ schema.resolvers,:',
        schema.resolvers
      );
      console.log(
        '🚀 ~ file: graphql.main.runtime.ts:410 ~ GraphqlMain ~ returnschemaSlots.map ~ wrappedResolvers:',
        wrappedResolvers
      );

      const module = createModule({
        id: extensionId,
        typeDefs: schema.typeDefs,
        resolvers: wrappedResolvers,
      });

      this.modules.set(extensionId, module);

      return module;
    });
  }

  static slots = [Slot.withType<Schema>(), Slot.withType<GraphQLServer>(), Slot.withType<PubSubSlot>()];

  static defaultConfig = {
    port: 4000,
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
