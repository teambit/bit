import { createContext, useContext } from 'react';
import UAParser from 'ua-parser-js';

export const userAgentContext = createContext<UAParser | undefined>(undefined);
export const UserAgentProvider = userAgentContext.Provider;

export const userAgentBrowserContext = createContext<any | undefined>(undefined);
export const userAgentBrowserProvider = userAgentBrowserContext.Provider;

/**
 * hook that returns the user-agent via context
 */
export function useUserAgent() {
  const browser = useContext(userAgentBrowserContext);
  if (window) {
    return new UAParser(window.navigator.userAgent);
  }
  return new UAParser(browser.headers['user-agent']);
}
