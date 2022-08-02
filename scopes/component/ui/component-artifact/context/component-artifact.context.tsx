import { createContext, useContext } from 'react';
import { BuildArtifacts } from '@teambit/component.ui.component-artifact';

export type ComponentArtifactModel = {
  buildArtifacts?: BuildArtifacts;
  artifactPanelState: {
    selectedPipelineId?: string;
    setSelectedPipelineId: (id?: string) => void;
  };
};

export const ComponentArtifactContext = createContext<ComponentArtifactModel | undefined>(undefined);

export const useComponentArtifactContext: () => ComponentArtifactModel | undefined = () => {
  const componentArtifactContext = useContext(ComponentArtifactContext);
  return componentArtifactContext;
};
