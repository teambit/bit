import express from 'express';
import cors from 'cors';
import graphqlHTTP from 'express-graphql';
import { Slot, SlotRegistry, Harmony } from '@teambit/harmony';
import { GraphQLModule } from '@graphql-modules/core';
import { Schema } from './schema';

export type GraphQLConfig = {
  port: number;
};

export type SchemaRegistry = SlotRegistry<Schema>;

export class GraphQLExtension {
  static dependencies = [];

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
    private context: Harmony
  ) {}

  private modules = new Map<string, GraphQLModule>();

  /**
   * start a graphql server.
   */
  async listen(port?: number) {
    const schema = this.createRootModule();

    const app = express();
    app.use(cors());
    app.use(
      '/graphql',
      graphqlHTTP({
        schema: schema.schema,
        graphiql: true
      })
    );

    app.listen(port || this.config.port);
  }

  /**
   * get the root schema.
   */
  getSchema() {
    const modules = this.moduleSlot.values();
    return this.createRootModule(modules);
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
      imports: modules
    });
  }

  private buildModules() {
    const schemaSlots = this.moduleSlot.toArray();
    return schemaSlots.map(([extensionId, schema]) => {
      const moduleDeps = this.getModuleDependencies(extensionId);

      const module = new GraphQLModule({
        typeDefs: schema.typeDefs,
        resolvers: schema.resolvers,
        imports: moduleDeps
      });

      this.modules.set(extensionId, module);

      return module;
    });
  }

  private getModuleDependencies(extensionId: string): GraphQLModule[] {
    const extension = this.context.extensions.get(extensionId);
    // @ts-ignore
    const deps = extension?.dependencies.map(ext => ext.id || ext.name);

    // @ts-ignore check :TODO why types are breaking here.
    return Array.from(this.modules.entries())
      .map(([depId, module]) => {
        const dep = deps?.includes(depId);
        if (!dep) return undefined;
        return module;
      })
      .filter(module => !!module);
  }

  static slots = [Slot.withType<Schema>()];

  static defaultConfig = {
    port: 4000
  };

  static async provider(deps, config: GraphQLConfig, [moduleSlot]: [SchemaRegistry], context: Harmony) {
    return new GraphQLExtension(config, moduleSlot, context);
  }
}
