import { createContext } from 'react';
import { ComponentModel } from '../component-model';

export const ComponentContext = createContext<ComponentModel>(ComponentModel.empty());
