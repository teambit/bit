import { createContext, useContext } from 'react';

import { ScopeModel } from '@teambit/scope.models.scope-model';

export const ScopeContext: React.Context<ScopeModel> = createContext<ScopeModel>(ScopeModel.empty());

export const useScope = () => useContext(ScopeContext);
