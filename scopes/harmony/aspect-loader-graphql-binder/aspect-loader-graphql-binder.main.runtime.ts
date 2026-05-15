import { MainRuntime } from '@teambit/cli';
import type { AspectLoaderMain } from '@teambit/aspect-loader';
import { AspectLoaderAspect } from '@teambit/aspect-loader/dist/aspect-loader.aspect.js';
import type { GraphqlMain } from '@teambit/graphql';
import { GraphqlAspect } from '@teambit/graphql/dist/graphql.aspect.js';
import { aspectLoaderSchema } from '@teambit/aspect-loader/dist/aspect-loader.graphql';
import { AspectLoaderGraphqlBinderAspect } from './aspect-loader-graphql-binder.aspect';

export class AspectLoaderGraphqlBinderMain {
  static runtime = MainRuntime;
  static dependencies = [AspectLoaderAspect, GraphqlAspect];
  static slots = [];
  static async provider([aspectLoader, graphql]: [AspectLoaderMain, GraphqlMain]) {
    graphql.register(() => aspectLoaderSchema(aspectLoader));
    return undefined;
  }
}

AspectLoaderGraphqlBinderAspect.addRuntime(AspectLoaderGraphqlBinderMain);

export default AspectLoaderGraphqlBinderMain;
