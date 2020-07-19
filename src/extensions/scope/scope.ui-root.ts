import { UIRoot } from '../ui';
import { ScopeExtension } from './scope.extension';

export class ScopeUIRoot implements UIRoot {
  constructor(
    /**
     * scope extension.
     */
    private scope: ScopeExtension
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
    ];
  }

  async resolvePattern() {
    return [];
  }
}
