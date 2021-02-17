import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { expect } from 'chai';
import {
  ComponentStatusResolverWithModifiedDependencies,
  ComponentStatusResolverWithModifiedFiles,
  ComponentStatusResolverWithNewStatus,
  ComponentStatusResolverWithStagedStatus,
  ComponentStatusResolverWithNewStatusAndIssue,
  ComponentStatusResolverWithStagedStatusAndIssue,
  ComponentStatusResolverWithModifiedStatusAndIssue,
} from './component-status-resolver.composition';

it('should render a modified status with modified dependencies', () => {
  const { getByText } = render(<ComponentStatusResolverWithModifiedDependencies />);
  const textStatus = getByText(/^D$/);

  textStatus.parentElement && fireEvent.mouseEnter(textStatus.parentElement);
  const textTooltip = getByText(/^Modified dependencies$/);

  expect(textStatus).to.exist;
  expect(textTooltip).to.exist;
});

it('should render a modified status with modified files', () => {
  const { getByText } = render(<ComponentStatusResolverWithModifiedFiles />);

  const textStatus = getByText(/^M$/);
  textStatus.parentElement && fireEvent.mouseEnter(textStatus.parentElement);
  const textTooltip = getByText(/^Modified files$/);

  expect(textStatus).to.exist;
  expect(textTooltip).to.exist;
});

it('should render a new status with new component', () => {
  const { getByText } = render(<ComponentStatusResolverWithNewStatus />);

  const textStatus = getByText(/^N$/);
  textStatus.parentElement && fireEvent.mouseEnter(textStatus.parentElement);
  const textTooltip = getByText(/^New component$/);

  expect(textStatus).to.exist;
  expect(textTooltip).to.exist;
});
it('should render a staged status with staged component', () => {
  const { getByText } = render(<ComponentStatusResolverWithStagedStatus />);

  const textStatus = getByText(/^S$/);
  textStatus.parentElement && fireEvent.mouseEnter(textStatus.parentElement);
  const textTooltip = getByText(/^Staged component$/);

  expect(textStatus).to.exist;
  expect(textTooltip).to.exist;
});
it('should render a new status with issue', () => {
  const { getByText } = render(<ComponentStatusResolverWithNewStatusAndIssue />);

  const textStatus = getByText(/^N$/);
  textStatus.parentElement && fireEvent.mouseEnter(textStatus.parentElement);
  const textTooltip = getByText(/^New component$/);
  const textTooltipIssue = getByText(/^1 issue found$/);

  expect(textStatus).to.exist;
  expect(textTooltip).to.exist;
  expect(textTooltipIssue).to.exist;
});
it('should render a staged status with issue', () => {
  const { getByText } = render(<ComponentStatusResolverWithStagedStatusAndIssue />);

  const textStatus = getByText(/^S$/);
  textStatus.parentElement && fireEvent.mouseEnter(textStatus.parentElement);
  const textTooltip = getByText(/^Staged component$/);
  const textTooltipIssue = getByText(/^1 issue found$/);

  expect(textStatus).to.exist;
  expect(textTooltip).to.exist;
  expect(textTooltipIssue).to.exist;
});

it('should render a modified dependencies and files status with issue', () => {
  const { getByText } = render(<ComponentStatusResolverWithModifiedStatusAndIssue />);

  const textStatus = getByText(/^M$/);
  textStatus.parentElement && fireEvent.mouseEnter(textStatus.parentElement);
  const textTooltipIssue = getByText(/^1 issue found$/);
  const textModifiedDependencies = getByText(/^Modified dependencies$/);
  const textModifiedFiles = getByText(/^Modified files$/);

  expect(textStatus).to.exist;
  expect(textTooltipIssue).to.exist;
  expect(textModifiedDependencies).to.exist;
  expect(textModifiedFiles).to.exist;
});
