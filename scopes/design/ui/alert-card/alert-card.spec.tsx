import React from 'react';
import { render } from '@testing-library/react';
import { InfoAlertCard, WarningAlertCard, ErrorAlertCard, SuccessAlertCard } from './alert-card.composition';

it('should render with a title', () => {
  const { getByText } = render(<InfoAlertCard />);
  const rendered = getByText('Info title');
  expect(rendered).toBeTruthy();
});

it('should render with some content', () => {
  const { getByText } = render(<InfoAlertCard />);
  const rendered = getByText('Content to be rendered');
  expect(rendered).toBeTruthy();
});

it('info level should render with the info icon', () => {
  const { getByLabelText } = render(<InfoAlertCard />);
  const rendered = getByLabelText('info');
  expect(rendered).toBeTruthy();
});

it('warning level should render with the warning icon', () => {
  const { getByLabelText } = render(<WarningAlertCard />);
  const rendered = getByLabelText('warning');
  expect(rendered).toBeTruthy();
});

it('error level should render with the error icon', () => {
  const { getByLabelText } = render(<ErrorAlertCard />);
  const rendered = getByLabelText('error');
  expect(rendered).toBeTruthy();
});

it('success level should render with the success icon', () => {
  const { getByLabelText } = render(<SuccessAlertCard />);
  const rendered = getByLabelText('success');
  expect(rendered).toBeTruthy();
});
