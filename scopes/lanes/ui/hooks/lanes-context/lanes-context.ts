import { createContext, useContext } from 'react';

import { LanesModel } from './lanes-model';

export const LanesContext: React.Context<LanesModel> = createContext<LanesModel>({});

export const useLanesContext = () => useContext(LanesContext);
