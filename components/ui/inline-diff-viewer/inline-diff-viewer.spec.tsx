import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { DiffFileRenderer, computeDiffFromContent } from './inline-diff-viewer';

const hunks = computeDiffFromContent('one\ntwo\nthree\n', 'one\ntwo changed\nthree\n');

describe('DiffFileRenderer — the line-interaction props are opt-in', () => {
  // The four interaction props (onLineClick, renderLineWidget, renderHeaderActions,
  // renderBelowHeader) shipped in 0.0.3 and were lost when the file was reverted,
  // which broke every build of the one consumer that uses them. They are optional,
  // so a renderer that passes none of them must come out exactly as before.
  it('renders no widget rows and no click affordance when nothing is supplied', () => {
    const { container } = render(<DiffFileRenderer fileName="a.ts" hunks={hunks} diffMode="unified" />);
    expect(container.querySelectorAll('tr').length).toBeGreaterThan(0);
    expect(container.querySelector('[class*="widgetRow"]')).toBeNull();
    expect(container.querySelector('[class*="diffRowClickable"]')).toBeNull();
  });

  it('reports the clicked line number', () => {
    const clicked: number[] = [];
    const { container } = render(
      <DiffFileRenderer fileName="a.ts" hunks={hunks} diffMode="unified" onLineClick={(n) => clicked.push(n)} />
    );
    const row = container.querySelector('tr[data-line="2"]') as HTMLElement;
    fireEvent.click(row);
    expect(clicked).toEqual([2]);
  });

  it('renders the widget under the selected line, and only there', () => {
    const { container } = render(
      <DiffFileRenderer
        fileName="a.ts"
        hunks={hunks}
        diffMode="unified"
        selectedLine={2}
        renderLineWidget={(n) => <div data-testid={`widget-${n}`}>widget</div>}
      />
    );
    expect(container.querySelectorAll('[data-testid^="widget-"]')).toHaveLength(1);
    expect(container.querySelector('[data-testid="widget-2"]')).toBeTruthy();
  });

  // The icon is the only cue that a line is commentable — it is hidden by CSS
  // until the row is hovered, so it must not be emitted at all on a diff that
  // cannot be commented on.
  it('shows the comment affordance only while onLineClick is supplied', () => {
    const inert = render(<DiffFileRenderer fileName="a.ts" hunks={hunks} diffMode="unified" />);
    expect(inert.container.querySelector('[class*="commentIcon"]')).toBeNull();

    const live = render(<DiffFileRenderer fileName="a.ts" hunks={hunks} diffMode="unified" onLineClick={() => {}} />);
    expect(live.container.querySelector('[class*="commentIcon"]')).toBeTruthy();
  });

  it('renders header actions and the band below the header', () => {
    const { getByText } = render(
      <DiffFileRenderer
        fileName="a.ts"
        hunks={hunks}
        renderHeaderActions={() => <button type="button">act</button>}
        renderBelowHeader={() => <div>below</div>}
      />
    );
    expect(getByText('act')).toBeTruthy();
    expect(getByText('below')).toBeTruthy();
  });
});
