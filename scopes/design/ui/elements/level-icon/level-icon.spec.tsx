import React from 'react';
import { render } from '@testing-library/react';
import { InfoLevelIcon, ErrorLevelIcon, SuccessLevelIcon, WarningLevelIcon } from './level-icon.composition';

it('info level should render with the info icon', () => {
  const { getByLabelText } = render(<InfoLevelIcon />);
  const rendered = getByLabelText('info');
  expect(rendered).toBeTruthy();
});
it('error level should render with the error icon', () => {
  const { getByLabelText } = render(<ErrorLevelIcon />);
  const rendered = getByLabelText('error');
  expect(rendered).toBeTruthy();
});
it('warning level should render with the warning icon', () => {
  const { getByLabelText } = render(<WarningLevelIcon />);
  const rendered = getByLabelText('warning');
  expect(rendered).toBeTruthy();
});
it('success level should render with the success icon', () => {
  const { getByLabelText } = render(<SuccessLevelIcon />);
  const rendered = getByLabelText('success');
  expect(rendered).toBeTruthy();
});
