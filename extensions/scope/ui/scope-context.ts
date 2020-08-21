import { createContext } from 'react';
import { ScopeModel } from './scope-model';

export const ScopeContext = createContext<ScopeModel>(ScopeModel.empty());
