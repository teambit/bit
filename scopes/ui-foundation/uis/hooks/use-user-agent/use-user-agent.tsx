import { createContext, useContext } from 'react';
import UAParser from 'ua-parser-js';

export const userAgentContext = createContext<UAParser | undefined>(undefined);
export const UserAgentProvider = userAgentContext.Provider;

/**
 * hook that returns the user-agent via context
 */
export function useUserAgent() {
  const userAgent = useContext(userAgentContext);
  return userAgent;
}
