import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server.node';
import { CompareAspectView } from './compare-aspect-view';

/** Captures the props each diff hands to the viewer: the config diff first, then the data diff. */
const mockViewerProps: Array<Record<string, any>> = [];

jest.mock('@teambit/code.ui.diff-viewer', () => ({
  DiffViewer: (props: Record<string, any>) => {
    mockViewerProps.push(props);
    return null;
  },
}));

function render(base: { config: unknown; data: unknown }, compare: { config: unknown; data: unknown }) {
  mockViewerProps.length = 0;
  renderToStaticMarkup(
    <CompareAspectView name="teambit.dependencies/dependency-resolver" baseAspectData={base as any} compareAspectData={compare as any} />
  );
  const [config, data] = mockViewerProps;
  return { config, data };
}

describe('CompareAspectView', () => {
  it('shows an unchanged config and unchanged data in full', () => {
    const same = { config: { policy: {} }, data: { packageName: 'a' } };
    const { config, data } = render(same, same);

    expect(config.contextLines).toBe(Number.MAX_SAFE_INTEGER);
    expect(data.contextLines).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('keeps the default context for a config or data that changed', () => {
    const { config, data } = render(
      { config: { policy: {} }, data: { packageName: 'a' } },
      { config: { policy: { dependencies: {} } }, data: { packageName: 'b' } }
    );

    expect(config.contextLines).toBeUndefined();
    expect(data.contextLines).toBeUndefined();
  });
});
