import { createContext, useContext } from 'react';
import { ComponentPipelineModel } from '@teambit/component.ui.pipelines.component-pipeline-model';

export type ComponentPipelineContextModel = ComponentPipelineModel & {
  selectedPipelineId?: string;
  setSelectedPipelineId: React.Dispatch<React.SetStateAction<string | undefined>>;
};

export const ComponentPipelineContext = createContext<ComponentPipelineContextModel | undefined>(undefined);

export const useComponentPipelineContext: () => ComponentPipelineContextModel | undefined = () => {
  const componentPipelineContext = useContext(ComponentPipelineContext);
  return componentPipelineContext;
};
