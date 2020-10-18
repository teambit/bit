import { connectToParent, ErrorCode } from 'penpal';
import type { AsyncMethodReturns } from 'penpal/lib/types';
import { Location } from 'history';
import { ReactRouterUI } from './react-router.ui.runtime';
import { Routing } from './route-context';

type HistoryState = { iframeSource?: string };
type ParentMethods = {
  setLocation: (e: Location) => void;
};

// bit.dev or any subdomain
const ALLOWED_PARENTS = /\/\/(.*\.)?bit\.dev$/;

export class IframeNavigator {
  private isIframed = typeof window !== 'undefined' && window.parent !== window;
  private parent?: AsyncMethodReturns<ParentMethods>;

  constructor(private reactRouterUI: ReactRouterUI) {
    if (!this.isIframed) return;

    // parent handles urls, do not use browser location
    reactRouterUI.setRoutingMode(Routing.inMemory);

    setTimeout(this.connectToParent, 300);
  }

  handleLocationChange = (next: Location, action: string) => {
    const state = next.state as HistoryState | undefined;
    if (state?.iframeSource === 'parent') return;
    if (action === 'POP') return; // ignore 'back' and 'forward' changes (handled by parent)

    this.parent?.setLocation(next);
  };

  private connectionRetries = 3;
  private connectToParent = () => {
    const parentConnection = connectToParent<ParentMethods>({
      parentOrigin: ALLOWED_PARENTS,
      timeout: 800,
      methods: {
        navigateTo: (path: string) => this.reactRouterUI.navigateTo(path, { iframeSource: 'parent' }),
      },
      // debug: true,
    });

    parentConnection.promise
      .then((e) => (this.parent = e))
      .catch((err: Error & { code: ErrorCode }) => {
        const shouldRetry =
          this.connectionRetries > 0 && [ErrorCode.ConnectionTimeout, ErrorCode.ConnectionDestroyed].includes(err.code);

        if (shouldRetry) {
          this.connectionRetries -= 1;
          setTimeout(this.connectToParent, 300);
        }
      });
  };
}
