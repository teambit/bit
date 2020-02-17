export type PipeOptions = {
  concurrency: number;
  traverse: 'only' | 'dependencies' | 'dependents' | 'both';
  caching: boolean;
};
