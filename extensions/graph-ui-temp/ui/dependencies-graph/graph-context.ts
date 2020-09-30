import { createContext } from 'react';
import { ComponentWidgetSlot } from '../../graph.ui.runtime';

export type ComponentGraph = {
  componentWidgets: ComponentWidgetSlot;
};

export const ComponentGraphContext = createContext<ComponentGraph | undefined>(undefined);
