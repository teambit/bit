import { useQuery as useDataQuery, DocumentNode } from '@apollo/client';
import { gql } from 'graphql-tag';
import { ScopeDescriptor } from '@teambit/scopes.scope-descriptor';
import { ScopeID } from '@teambit/scopes.scope-id';

export const GET_CLOUD_SCOPES_QUERY: DocumentNode = gql`
  query GET_CLOUD_SCOPES($ids: [String!]) {
    getCloudScopes(ids: $ids) {
      id
      icon
      backgroundIconColor
      stripColor
      displayName
    }
  }
`;

export function useCloudScopes(ids?: string[]): { cloudScopes?: ScopeDescriptor[] } {
  const { data } = useDataQuery<{ getCloudScopes?: (ScopeDescriptor & { id: string })[] }>(GET_CLOUD_SCOPES_QUERY, {
    variables: {
      ids,
    },
    skip: !ids?.length,
  });
  return {
    cloudScopes: (data?.getCloudScopes || []).map((scope) => {
      const scopeId = ScopeID.fromString(scope.id);
      const scopeDescriptorObj = {
        ...scope,
        id: scopeId.toObject(),
        scopeStyle: {
          icon: scope.icon,
          backgroundIconColor: scope.backgroundIconColor,
          stripColor: scope.stripColor,
        },
        visibility: false,
        isLegacy: false,
        members: [],
        _legacyId: '',
      };
      return ScopeDescriptor.fromObject(scopeDescriptorObj);
    }),
  };
}
