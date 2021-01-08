import { createContext } from 'react';

export type LoaderApi = {
  isActive: (id: string) => boolean;
  update: (id: string, value: boolean) => boolean;
  remove: (id: string) => boolean;
};

const defaultLoaderApi: LoaderApi = {
  isActive: () => false,
  update: () => false,
  remove: () => false,
};

export const LoaderContext: React.Context<LoaderApi> = createContext<LoaderApi>(defaultLoaderApi);
