import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { LoaderFallback } from './loader-fallback';

describe('loader-fallback', () => {
  it('should render target, when defined', () => {
    const { getByText } = render(
      <LoaderFallback Target={Component} DefaultComponent={Default} Loader={Loader} timeout={10} />
    );

    const result = getByText('test target');

    expect(result).toBeInTheDocument();
  });

  it('should render default, when target is undefined', () => {
    const { getByText } = render(
      <LoaderFallback Target={undefined} DefaultComponent={Default} Loader={Loader} timeout={10} />
    );

    const result = getByText('Target is undefined');

    expect(result).toBeInTheDocument();
  });

  it('should render loader, when target becomes undefined', () => {
    const { rerender, getByText } = render(
      <LoaderFallback Target={Component} DefaultComponent={Default} Loader={Loader} timeout={10} />
    );

    rerender(<LoaderFallback Target={undefined} DefaultComponent={Default} Loader={Loader} timeout={10} />);

    const result = getByText('loading...');

    expect(result).toBeInTheDocument();
  });

  it('should render DefaultComponent, after timeout, when target becomes undefined', async () => {
    const { rerender, getByText } = render(
      <LoaderFallback Target={Component} DefaultComponent={Default} Loader={Loader} timeout={10} />
    );

    rerender(<LoaderFallback Target={undefined} DefaultComponent={Default} Loader={Loader} timeout={10} />);

    await waitFor(() => {
      expect(getByText('Target is undefined')).toBeInTheDocument();
    });
  });
});

function Component() {
  return <div>test target</div>;
}

function Default() {
  return <div>Target is undefined</div>;
}

function Loader() {
  return <div>loading...</div>;
}
