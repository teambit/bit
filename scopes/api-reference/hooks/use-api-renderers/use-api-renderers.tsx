import type { APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';
import type { ReactNode } from 'react';
import React, { createContext, useContext } from 'react';

export const APIRefRenderersContext = createContext<{
  nodeRenderers: APINodeRenderer[];
}>({
  nodeRenderers: [],
});

export type APIRefRenderersProviderProps = {
  children: ReactNode;
  nodeRenderers: APINodeRenderer[];
};

export const APIRefRenderersProvider: React.FC<APIRefRenderersProviderProps> = ({ children, nodeRenderers }) => {
  return (
    <APIRefRenderersContext.Provider
      value={{
        nodeRenderers,
      }}
    >
      {children}
    </APIRefRenderersContext.Provider>
  );
};

export const useAPIRefRenderers = () => {
  return useContext(APIRefRenderersContext);
};
