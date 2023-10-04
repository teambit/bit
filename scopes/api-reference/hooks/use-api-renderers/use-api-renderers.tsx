import { APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';
import React, { createContext, useContext, ReactNode } from 'react';

export const APIRefRenderersContext = createContext<{
  nodeRenderers: APINodeRenderer[];
  overviewRenderers: APINodeRenderer[];
}>({
  nodeRenderers: [],
  overviewRenderers: [],
});

export type APIRefRenderersProviderProps = {
  children: ReactNode;
  nodeRenderers: APINodeRenderer[];
  overviewRenderers: APINodeRenderer[];
};

export const APIRefRenderersProvider: React.FC<APIRefRenderersProviderProps> = ({
  children,
  nodeRenderers,
  overviewRenderers,
}) => {
  return (
    <APIRefRenderersContext.Provider
      value={{
        nodeRenderers,
        overviewRenderers,
      }}
    >
      {children}
    </APIRefRenderersContext.Provider>
  );
};

export const useAPIRefRenderers = () => {
  return useContext(APIRefRenderersContext);
};
