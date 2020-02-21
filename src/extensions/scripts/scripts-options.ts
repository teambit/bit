export type ScriptsOptions = {
  concurrency: number;
  traverse: 'only' | 'dependencies' | 'dependents' | 'both';
  caching: boolean;
};
