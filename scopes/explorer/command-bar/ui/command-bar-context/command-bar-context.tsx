import { createContext } from 'react';
import { CommandBarUI } from '../../command-bar.ui.runtime';

export const CommandBarContext = createContext<CommandBarUI | undefined>(undefined);
