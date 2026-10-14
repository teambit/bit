import React from 'react';
import { act, render } from '@testing-library/react';
import type { ComponentModel } from '@teambit/component';
import { ComponentPreview } from './preview';

// jest hoists `jest.mock` above the imports, so anything its factory closes over has to be
// `mock`-prefixed to be allowed out of scope.

/**
 * the `pub` method the preview hands to penpal. the preview inside the iframe calls it to report its size.
 */
const mockPub: { current?: (event: any, message: any) => void } = {};

jest.mock('penpal', () => ({
  connectToChild: ({ methods }) => {
    mockPub.current = methods.pub;
    return { promise: new Promise(() => {}), destroy: () => {} };
  },
}));

// the theme and pubsub wiring is irrelevant here and pulls a large dependency graph
jest.mock('@teambit/base-react.themes.theme-switcher', () => ({ useThemePicker: () => undefined }));
jest.mock('@teambit/pubsub', () => ({ usePubSubIframe: () => {} }));
jest.mock('@teambit/ui-foundation.ui.rendering.html', () => ({ ERROR_EVENT: 'error', LOAD_EVENT: 'load' }));

const component = {
  id: { toString: () => 'teambit.base-ui/input/button@0.6.2' },
  server: { url: '/preview/teambit.base-ui/input/button/' },
  preview: { isScaling: true },
} as unknown as ComponentModel;

function styleHeight(element?: HTMLElement | null) {
  return parseFloat(element?.style.height || '') || 0;
}

/**
 * whether the wrapper is sized by the iframe it contains. otherwise its height comes from outside (0 here).
 */
const layout = { wrapperFollowsIframe: false };

// jsdom doesn't lay anything out, so offsetHeight is always 0. the iframe is as tall as its style says.
beforeAll(() => {
  Object.defineProperty(HTMLIFrameElement.prototype, 'offsetHeight', {
    configurable: true,
    get() {
      return styleHeight(this);
    },
  });
  Object.defineProperty(HTMLDivElement.prototype, 'offsetHeight', {
    configurable: true,
    get() {
      return layout.wrapperFollowsIframe ? styleHeight(this.querySelector('iframe')) : 0;
    },
  });
});

afterAll(() => {
  delete (HTMLIFrameElement.prototype as any).offsetHeight;
  delete (HTMLDivElement.prototype as any).offsetHeight;
});

type PreviewProps = { innerBottomPadding?: number; previewName?: string };

function renderPreview(props: PreviewProps = {}) {
  const result = render(<ComponentPreview component={component} title="preview" {...props} />);
  const getIframe = () => result.container.querySelector('iframe') as HTMLIFrameElement;
  const report = (width: number, height: number) =>
    act(() => {
      mockPub.current?.({}, { type: 'preview-size', data: { width, height } });
    });
  const rerender = (nextProps: PreviewProps = props) =>
    result.rerender(<ComponentPreview component={component} title="preview" {...nextProps} />);
  return { getIframe, report, rerender };
}

describe('ComponentPreview', () => {
  beforeEach(() => {
    mockPub.current = undefined;
    layout.wrapperFollowsIframe = false;
  });

  it('starts hidden and becomes visible when the first report has no width', () => {
    const { getIframe, report } = renderPreview();
    expect(getIframe().style.visibility).toBe('hidden');
    report(0, 0);
    expect(getIframe().style.visibility).toBe('');
  });

  it('applies a normal report and becomes visible', () => {
    const { getIframe, report } = renderPreview();
    report(1280, 800);
    expect(getIframe().style.visibility).toBe('');
    expect(getIframe().style.width).toBe('1280px');
    expect(styleHeight(getIframe())).toBe(800);
  });

  it('does not grow by innerBottomPadding when the content reports the iframe height', () => {
    const { getIframe, report } = renderPreview({ innerBottomPadding: 4 });
    report(1280, 800);
    expect(styleHeight(getIframe())).toBe(804);
    // content with min-height: 100vh fills the iframe and reports its height back
    report(1280, styleHeight(getIframe()));
    report(1280, styleHeight(getIframe()));
    report(1280, styleHeight(getIframe()));
    expect(styleHeight(getIframe())).toBe(804);
  });

  it('freezes the height after two consecutive jumps to 2x the iframe height', () => {
    const { getIframe, report } = renderPreview();
    report(1280, 800);
    report(1280, 2000);
    expect(styleHeight(getIframe())).toBe(2000);
    report(1280, 5000);
    expect(styleHeight(getIframe())).toBe(2000);
    report(1024, 2500);
    expect(styleHeight(getIframe())).toBe(2000);
    // width still follows the reports
    expect(getIframe().style.width).toBe('1024px');
  });

  it('follows height reports again after the url changes', () => {
    const { getIframe, report, rerender } = renderPreview();
    report(1280, 800);
    report(1280, 2000);
    report(1280, 5000);
    expect(styleHeight(getIframe())).toBe(2000);
    // a different preview name loads a different url in the same iframe
    rerender({ previewName: 'overview' });
    report(1280, 900);
    expect(styleHeight(getIframe())).toBe(900);
  });

  it('caps a large report at 20000', () => {
    const { getIframe, report } = renderPreview();
    report(1280, 60810);
    expect(styleHeight(getIframe())).toBe(20000);
  });

  it('keeps following ordinary height changes', () => {
    const { getIframe, report } = renderPreview();
    report(1280, 800);
    report(1280, 1200);
    expect(styleHeight(getIframe())).toBe(1200);
    report(1280, 1500);
    expect(styleHeight(getIframe())).toBe(1500);
  });

  it('does not grow by innerBottomPadding on re-renders when the wrapper is sized by the iframe', () => {
    layout.wrapperFollowsIframe = true;
    const { getIframe, report, rerender } = renderPreview({ innerBottomPadding: 4 });
    report(1280, 800);
    const heightAfterReport = styleHeight(getIframe());
    // the wrapper contains the iframe and its padding, and feeds back into the iframe height on every render
    rerender();
    rerender();
    rerender();
    expect(styleHeight(getIframe())).toBe(heightAfterReport);
  });
});
