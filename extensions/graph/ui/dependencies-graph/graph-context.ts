import { createContext } from 'react';
import { ComponentWidgetSlot } from '../../graph.ui.runtime';

/** internal context, to pass shared information to all nodes */
export type ComponentGraph = {
  componentWidgets: ComponentWidgetSlot;
};

export const ComponentGraphContext = createContext<ComponentGraph | undefined>(undefined);
