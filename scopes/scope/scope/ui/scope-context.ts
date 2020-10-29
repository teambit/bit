import { createContext } from 'react';

import { ScopeModel } from './scope-model';

export const ScopeContext: React.Context<ScopeModel> = createContext<ScopeModel>(ScopeModel.empty());
