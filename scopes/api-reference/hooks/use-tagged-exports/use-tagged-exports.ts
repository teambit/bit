import { DataQueryResult, useDataQuery } from '@teambit/ui-foundation.ui.hooks.use-data-query';
import { gql } from '@apollo/client';
import { TaggedExportsModel, TaggedExportsQueryResult } from '@teambit/api-reference.models.tagged-exports-model';

const GET_TAGGED_EXPORTS = gql`
  query SchemaTaggedExports($componentId: String!) {
    getHost {
      id # used for GQL caching
      getTaggedSchemaExports(id: $componentId)
    }
  }
`;

export function useTaggedExports(
  componentId: string
): { taggedExportsModel?: TaggedExportsModel } & Omit<
  DataQueryResult<TaggedExportsQueryResult, { componentId: string }>,
  'data'
> {
  const { data, ...rest } = useDataQuery(GET_TAGGED_EXPORTS, {
    variables: {
      componentId,
    },
  });

  const taggedExportsModel = data?.getHost?.getTaggedSchemaExports
    ? TaggedExportsModel.from(data, componentId)
    : undefined;

  return {
    ...rest,
    taggedExportsModel,
  };
}
