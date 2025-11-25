import type { ScopeDescriptorProps } from '@teambit/scopes.scope-descriptor';

export type GetScopesGQLResponse = {
  data?: {
    getScopes?: Array<ScopeDescriptorGQLResponse>;
  };
};

export type ScopeDescriptorGQLResponse = Omit<ScopeDescriptorProps, 'id'> & { id: string };
