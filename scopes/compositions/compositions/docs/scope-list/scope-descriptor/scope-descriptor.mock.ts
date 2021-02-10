import { ScopeDescriptor } from './scope-descriptor';

export type MockScopeOptions = {
  id?: {
    owner: string;
    scopeName: string;
  };
  description?: string;
  componentCount?: number;
};

export function mockScopeDescriptor(options: MockScopeOptions = {}) {
  const opts = Object.assign({}, defaultOptions, options);
  return ScopeDescriptor.fromObject(opts);
}

export const defaultOptions = {
  id: {
    owner: 'teambit',
    scopeName: 'design',
  },
  description: 'helps to build consistent UIs',
  componentCount: 100,
};
