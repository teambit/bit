import { createContext, useContext } from 'react';
import type { BrowserData } from '@teambit/react.rendering.ssr';
import UAParser from 'ua-parser-js';

export const userAgentContext = createContext<UAParser | undefined>(undefined);
export const UserAgentProvider = userAgentContext.Provider;

export const ssrBrowserContext = createContext<BrowserData | undefined>(undefined);
export const SSRBrowserProvider = ssrBrowserContext.Provider;

/**
 * hook that returns the user-agent via context
 */
export function useUserAgent() {
  const browser = useContext(ssrBrowserContext);
  if (!browser) {
    return new UAParser(window.navigator.userAgent);
  }

  const agent = new UAParser(browser.headers['user-agent']);
  return agent;
}
