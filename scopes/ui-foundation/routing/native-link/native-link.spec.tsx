import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { expect } from 'chai';

import { NativeLink } from './native-link';

describe('native html link', () => {
  it('should render', () => {
    const { getByText } = render(<NativeLink>link</NativeLink>);
    const rendered = getByText('link');
    expect(rendered).to.exist;
  });

  it('should link to target', () => {
    const { getByText } = render(<NativeLink href="http://target">link</NativeLink>);
    const rendered = getByText('link');
    expect(rendered.tagName).to.equal('A');
    expect(rendered).to.have.property('href').equals('http://target/');
  });

  it('should open in new tab/window, when external=true', () => {
    const { getByText } = render(<NativeLink external>link</NativeLink>);
    const rendered = getByText('link');
    expect(rendered).to.have.property('target').equals('_blank');
    // security - rel='noopener' prevents the opened page to gain any kind of access to the original page.
    expect(rendered).to.have.property('rel').equals('noopener');
  });

  it('should replace url without changing history, when replace=true', () => {
    const { getByText } = render(
      <NativeLink href="#target" replace>
        link
      </NativeLink>
    );
    const rendered = getByText('link');
    expect(window.history.length).to.equal(1, '(sanity) initial history length');

    fireEvent.click(rendered);

    // if this fails, add `await waitFor(() => window.location.hash == '#hash')`
    expect(window.location.hash).to.equals('#target');
    expect(window.history.length).to.equal(1, 'history length after navigation');
  });
});
