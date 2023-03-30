import React from 'react';
import { render } from '@testing-library/react';
import { BasicLink, ExternalLink } from './link.composition';
import { Link } from './link';

describe('native html link', () => {
  it('should render', () => {
    const { getByText } = render(<BasicLink />);
    const rendered = getByText('bit.dev');
    expect(rendered).toBeInstanceOf(HTMLElement);
  });

  it('should link to target', () => {
    const { getByText } = render(<BasicLink />);
    const rendered = getByText('bit.dev');
    expect(rendered.tagName).toEqual('A');
    expect(rendered).toHaveProperty('href', 'https://bit.dev/');
  });

  it('should open in new tab/window, when external=true', () => {
    const { getByText } = render(<ExternalLink />);
    const rendered = getByText('bit.dev');
    expect(rendered).toHaveProperty('target', '_blank');
    // security - rel='noopener' prevents the opened page to gain any kind of access to the original page.
    expect(rendered).toHaveProperty('rel', 'noopener');
  });

  it('should pass active styles when explicitly active', () => {
    const { getByText } = render(
      <Link href="/" activeClassName="active" activeStyle={{ fontWeight: 'bold' }} active>
        click here
      </Link>
    );
    const rendered = getByText('click here');
    expect(rendered).toHaveClass('active');
    expect(rendered).toHaveStyle({ fontWeight: 'bold' });
  });

  it('should not pass active styles when explicitly not active', () => {
    const { getByText } = render(
      <Link href="/" activeClassName="active" activeStyle={{ fontWeight: 'bold' }} active={false}>
        click here
      </Link>
    );
    const rendered = getByText('click here');
    expect(rendered).not.toHaveClass('active');
    expect(rendered).not.toHaveStyle({ fontWeight: 'bold' });
  });

  it('should automatically pass active style when matching location', () => {
    const { getByText } = render(
      <Link href="/" activeClassName="active" activeStyle={{ fontWeight: 'bold' }}>
        click here
      </Link>
    );
    const rendered = getByText('click here');
    expect(rendered).toHaveClass('active');
    expect(rendered).toHaveStyle({ fontWeight: 'bold' });
  });

  it('should automatically skip active style when not matching location', () => {
    const { getByText } = render(
      <Link href="/other-path" activeClassName="active" activeStyle={{ fontWeight: 'bold' }}>
        click here
      </Link>
    );
    const rendered = getByText('click here');
    expect(rendered).not.toHaveClass('active');
    expect(rendered).not.toHaveStyle({ fontWeight: 'bold' });
  });
});
