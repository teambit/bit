import { createContext } from 'react';

import { ComponentModel } from '../component-model';

export const ComponentContext: React.Context<ComponentModel> = createContext<ComponentModel>(ComponentModel.empty());
