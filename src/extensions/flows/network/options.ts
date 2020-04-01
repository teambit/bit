export type ExecutionOptions = {
  concurrency: number;
  traverse: 'only' | 'dependencies' | 'dependents' | 'both';
  caching: boolean;
};
