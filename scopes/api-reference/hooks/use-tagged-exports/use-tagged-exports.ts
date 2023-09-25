import { useQuery, gql } from '@teambit/graphql.hooks.use-query-light';
import { TaggedExportsModel, TaggedExportsQueryResult } from '@teambit/api-reference.models.tagged-exports-model';

const GQL_SERVER = '/graphql';

const GET_TAGGED_EXPORTS = gql`
  query SchemaTaggedExports($componentId: String!) {
    getHost {
      id # used for GQL caching
      getTaggedSchemaExports(id: $componentId)
    }
  }
`;

export function useTaggedExports(componentId: string): { taggedExportsModel: TaggedExportsModel | undefined } {
  const { data } = useQuery<TaggedExportsQueryResult>(GET_TAGGED_EXPORTS, {
    variables: {
      componentId,
    },
    server: GQL_SERVER,
  });

  const taggedExportsModel = data?.getHost?.getTaggedSchemaExports
    ? TaggedExportsModel.from(data, componentId)
    : undefined;

  return {
    taggedExportsModel,
  };
}
