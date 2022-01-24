import { createContext, useContext } from 'react';

import { LanesState } from './lanes-state';

export const LanesContext: React.Context<LanesState> = createContext<LanesState>({});

export const useLanesContext = () => useContext(LanesContext);
