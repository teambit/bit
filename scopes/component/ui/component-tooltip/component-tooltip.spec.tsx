import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { expect } from 'chai';
import {
  ComponentTooltipWithNewStatus,
  ComponentTooltipWithStagedStatus,
  ComponentTooltipWithModifiedFilesAndDependenciesStatus,
  ComponentTooltipWithModifiedFilesStatusAndIssues,
} from './component-tooltip.composition';

it('should render a tooltip with new component', () => {
  const { getByText } = render(<ComponentTooltipWithNewStatus />);

  const textStatus = getByText('N');
  fireEvent.mouseEnter(textStatus);
  const textTooltip = getByText(/^New component$/);

  expect(textTooltip).to.exist;
});

it('should render a tooltip with staged component', () => {
  const { getByText } = render(<ComponentTooltipWithStagedStatus />);

  const textStatus = getByText('S');
  fireEvent.mouseEnter(textStatus);
  const textTooltip = getByText(/^Staged component$/);

  expect(textTooltip).to.exist;
});

it('should render a tooltip with multiple status, modified dependencies and files', () => {
  const { getByText } = render(<ComponentTooltipWithModifiedFilesAndDependenciesStatus />);

  const textStatus = getByText('M');
  fireEvent.mouseEnter(textStatus);
  const textModifiedDependencies = getByText(/^Modified dependencies$/);
  const textModifiedFiles = getByText(/^Modified files$/);

  expect(textModifiedDependencies).to.exist;
  expect(textModifiedFiles).to.exist;
});

it('should render a tooltip with multiple status, modified files and 2 issues found', () => {
  const { getByText } = render(<ComponentTooltipWithModifiedFilesStatusAndIssues />);

  const textStatus = getByText('M');
  fireEvent.mouseEnter(textStatus);
  textStatus.parentElement && fireEvent.mouseEnter(textStatus.parentElement);
  const textTooltip = getByText(/^Modified files$/);
  const textTooltipIssue = getByText(/^2 issues found$/);

  expect(textTooltip).to.exist;
  expect(textTooltipIssue).to.exist;
});
