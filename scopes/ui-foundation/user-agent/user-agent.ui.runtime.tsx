import { UIAspect, UIRuntime, UiUI } from '@teambit/ui';
import React, { ReactNode } from 'react';
import UAParser from 'ua-parser-js';
import { UserAgentProvider } from '@teambit/ui-foundation.ui.hooks.use-user-agent';
import { UserAgentAspect } from './user-agent.aspect';

type UserAgentRenderCtx = {
  userAgent?: UAParser;
};

/**
 * user agent aspect
 */
export class UserAgentUI {
  static slots = [];

  static dependencies = [UIAspect];

  static runtime = UIRuntime;

  static async provider([uiUi]: [UiUI]) {
    const userAgentUi = new UserAgentUI();

    uiUi.registerRenderHooks<UserAgentRenderCtx, undefined>({
      serverInit: ({ browser }) => {
        const userAgent = new UAParser(browser?.connection.headers?.['user-agent']);
        return {
          userAgent,
        };
      },
      browserInit: () => {
        return {
          userAgent: new UAParser(window.navigator.userAgent),
        };
      },
      reactContext: UserAgentReactContext,
    });

    return userAgentUi;
  }
}

function UserAgentReactContext({ children, renderCtx }: { children: ReactNode; renderCtx?: UserAgentRenderCtx }) {
  return <UserAgentProvider value={renderCtx?.userAgent}>{children}</UserAgentProvider>;
}

UserAgentAspect.addRuntime(UserAgentUI);
