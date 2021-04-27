import { ComponentModel } from '@teambit/component';
import { expect } from 'chai';
import { toPreviewUrl, toPreviewServer, toPreviewHash } from './urls';

const component = ComponentModel.from({
  id: { name: 'input/button', version: '0.6.2', scope: 'teambit.base-ui' },
  description: '',
  displayName: '',
  packageName: '',
});

const componentWithoutVersion = ComponentModel.from({
  id: { name: 'input/button', version: undefined, scope: 'teambit.base-ui' },
  description: '',
  displayName: '',
  packageName: '',
});

const componentWithExplicitServer = ComponentModel.from({
  id: { name: 'input/button', version: '0.6.2', scope: 'teambit.base-ui' },
  server: {
    env: 'teambit.bit/overview',
    url: '/preview/teambit.bit/overview',
  },
  description: '',
  displayName: '',
  packageName: '',
});

describe('toPreviewHash()', () => {
  it('should make url from component only', () => {
    const result = toPreviewHash(component);

    expect(result).to.equal('teambit.base-ui/input/button@0.6.2');
  });

  it('should make url using preview name', () => {
    const result = toPreviewHash(component, 'overview');

    expect(result).to.equal('teambit.base-ui/input/button@0.6.2?preview=overview');
  });

  it('should include query params and preview name when available', () => {
    const result = toPreviewHash(component, 'overview', 'who=ami');

    expect(result).to.equal('teambit.base-ui/input/button@0.6.2?preview=overview&who=ami');
  });

  it('should include query params even without preview name', () => {
    const result = toPreviewHash(component, undefined, 'who=ami');

    expect(result).to.equal('teambit.base-ui/input/button@0.6.2?who=ami');
  });

  it('should make url from component without version (latest)', () => {
    const result = toPreviewHash(componentWithoutVersion, undefined, 'who=ami');

    expect(result).to.equal('teambit.base-ui/input/button?who=ami');
  });
});

describe('toPreviewServer()', () => {
  it('should fallback to api url, when explicit server is not available', () => {
    const result = toPreviewServer(component);

    expect(result).to.equal('/api/teambit.base-ui/input/button@0.6.2/~aspect/preview/');
  });

  it('should use explicit server url, when available', () => {
    const result = toPreviewServer(componentWithExplicitServer);

    expect(result).to.equal('/preview/teambit.bit/overview/');
  });

  it('should make from component without version (latest), when explicit url is not available', () => {
    const result = toPreviewServer(componentWithoutVersion);

    expect(result).to.equal('/api/teambit.base-ui/input/button/~aspect/preview/');
  });
});

// production examples:
// https://hu9y25l.scopes.bit.dev/api/teambit.base-ui/input/button@0.6.2/~aspect/preview/#teambit.base-ui/input/button@0.6.2?preview=overview&undefined
// https://hu9y25l.scopes.bit.dev/api/teambit.base-ui/input/button@0.5.10/~aspect/preview/#teambit.base-ui/input/button@0.5.10?preview=compositions&BasicButton

describe('toPreviewUrl()', () => {
  it('should make url from component only', () => {
    const result = toPreviewUrl(component);

    expect(result).to.equal(
      '/api/teambit.base-ui/input/button@0.6.2/~aspect/preview/#teambit.base-ui/input/button@0.6.2'
    );
  });

  it('should make url using preview name', () => {
    const result = toPreviewUrl(component, 'overview');

    expect(result).to.equal(
      '/api/teambit.base-ui/input/button@0.6.2/~aspect/preview/#teambit.base-ui/input/button@0.6.2?preview=overview'
    );
  });

  it('should include query params and preview name when available', () => {
    const result = toPreviewUrl(component, 'overview', 'who=ami');

    expect(result).to.equal(
      '/api/teambit.base-ui/input/button@0.6.2/~aspect/preview/#teambit.base-ui/input/button@0.6.2?preview=overview&who=ami'
    );
  });

  it('should include query params even without preview name', () => {
    const result = toPreviewUrl(component, undefined, 'who=ami');

    expect(result).to.equal(
      '/api/teambit.base-ui/input/button@0.6.2/~aspect/preview/#teambit.base-ui/input/button@0.6.2?who=ami'
    );
  });

  it('should include query params when it is an array', () => {
    const result = toPreviewUrl(component, undefined, ['who=ami', 'mon=ami']);

    expect(result).to.equal(
      '/api/teambit.base-ui/input/button@0.6.2/~aspect/preview/#teambit.base-ui/input/button@0.6.2?who=ami&mon=ami'
    );
  });

  it('should make url from component without version (latest)', () => {
    const result = toPreviewUrl(componentWithoutVersion, undefined, 'who=ami');

    expect(result).to.equal('/api/teambit.base-ui/input/button/~aspect/preview/#teambit.base-ui/input/button?who=ami');
  });

  it('should use explicit url, when available', () => {
    const result = toPreviewUrl(componentWithExplicitServer, 'overview', 'who=ami');

    expect(result).to.equal(
      '/preview/teambit.bit/overview/#teambit.base-ui/input/button@0.6.2?preview=overview&who=ami'
    );
  });

  it('should make preview link', () => {
    const result = toPreviewUrl(component, 'compositions', 'BasicButton');

    expect(result).to.equal(
      '/api/teambit.base-ui/input/button@0.6.2/~aspect/preview/#teambit.base-ui/input/button@0.6.2?preview=compositions&BasicButton'
    );
  });
});
