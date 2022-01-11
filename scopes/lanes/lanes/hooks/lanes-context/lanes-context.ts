import { createContext, useContext } from 'react';

import { LanesState } from '../../state/lanes.state';

export const LanesContext: React.Context<LanesState> = createContext<LanesState>(LanesState.empty());

export const useLanesContext = () => useContext(LanesContext);
