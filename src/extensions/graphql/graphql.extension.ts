import express from 'express';
import cors from 'cors';
import graphqlHTTP from 'express-graphql';
import { Slot, SlotRegistry } from '@teambit/harmony';
import { GraphQLModule } from '@graphql-modules/core';

export type GraphQLConfig = {
  port: number;
};

export type ModuleRegistry = SlotRegistry<GraphQLModule>;

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
    private moduleSlot: ModuleRegistry
  ) {}

  private createRootModule(modules: GraphQLModule[]) {
    return new GraphQLModule({
      imports: modules
    });
  }

  /**
   * start a graphql server.
   */
  async listen(port?: number) {
    const modules = this.moduleSlot.values();
    const schema = this.createRootModule(modules);

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

  getSchema() {
    const modules = this.moduleSlot.values();
    return this.createRootModule(modules);
  }

  /**
   * register a new graphql module.
   */
  register(module: GraphQLModule) {
    this.moduleSlot.register(module);
    return this;
  }

  static slots = [Slot.withType<GraphQLModule>()];

  static defaultConfig = {
    port: 4000
  };

  static async provider(deps, config: GraphQLConfig, [moduleSlot]: [ModuleRegistry]) {
    return new GraphQLExtension(config, moduleSlot);
  }
}
