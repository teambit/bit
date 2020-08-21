import { UIRoot } from '../ui';
import type { ScopeMain } from './scope.main.runtime';

export class ScopeUIRoot implements UIRoot {
  constructor(
    /**
     * scope extension.
     */
    private scope: ScopeMain
  ) {}

  readonly name = 'scope';

  get path(): string {
    return this.scope.path;
  }

  get extensionsPaths() {
    return [
      require.resolve('./scope.ui'),
      require.resolve('../tester/tester.ui'),
      require.resolve('../changelog/changelog.ui'),
      require.resolve('../component/component.ui'),
      require.resolve('../compositions/compositions.ui'),
      require.resolve('../docs/docs.ui'),
      require.resolve('../notifications/notification.ui'),
    ];
  }

  get aspectPaths() {
    return [];
  }

  async resolvePattern() {
    return [];
  }
}
