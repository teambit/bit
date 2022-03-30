import React from 'react';
import { render } from '@testing-library/react';
import { MockTarget } from '../mock-component';
import { bubbleToComponent } from './bubble-to-component';

it('should find component when starting from a div', () => {
  const { getByText, getByTestId } = render(
    <MockTarget data-testid="expected-result">
      <div>hello world</div>
    </MockTarget>
  );

  const rendered = getByText('hello world');

  const result = bubbleToComponent(rendered);

  expect(result?.element).toBe(getByTestId('expected-result'));
  expect(result?.components).toEqual([MockTarget]);
});

it('should bubble to root component when it renders itself recursively', () => {
  const { getByText, getByTestId } = render(
    <MockTarget data-testid="expected-result">
      <MockTarget>
        <MockTarget>
          <div>hello world</div>
        </MockTarget>
      </MockTarget>
    </MockTarget>
  );

  const rendered = getByText('hello world');

  const result = bubbleToComponent(rendered);

  expect(result?.element).toBe(getByTestId('expected-result'));
  expect(result?.components).toEqual([MockTarget]);
});

it('should find first component, when parent propagation is disabled', () => {
  const { getByText, getByTestId } = render(
    <MockTarget>
      <MockTarget>
        <MockTarget data-testid="expected-result">
          <div>hello world</div>
        </MockTarget>
      </MockTarget>
    </MockTarget>
  );

  const rendered = getByText('hello world');

  const result = bubbleToComponent(rendered, { propagateSameParents: false });

  expect(result?.element).toBe(getByTestId('expected-result'));
  expect(result?.components).toEqual([MockTarget]);
});
