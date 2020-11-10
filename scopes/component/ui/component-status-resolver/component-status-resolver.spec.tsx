import React from 'react';
import { render } from '@testing-library/react';
import {
  ComponentStatusResolverWithModifiedDependencies,
  ComponentStatusResolverWithModifiedFiles,
  ComponentStatusResolverWithNewStatus,
  ComponentStatusResolverWithStagedStatus,
  ComponentStatusResolverWithNewStatusAndIssue,
  ComponentStatusResolverWithStagedStatusAndIssue,
  ComponentStatusResolverWithModifiedStatusAndIssue,
} from './component-status-resolver.composition';

describe('Component Status Resolver', () => {
  it('should render a modified status with modified dependencies', () => {
    const { getByText } = render(<ComponentStatusResolverWithModifiedDependencies />);
    const textStatus = getByText(/^M$/);
    const textTooltip = getByText(/^Modified dependencies$/);
    expect(textStatus).toBeInTheDocument();
    expect(textTooltip).toBeInTheDocument();
  });
  it('should render a modified status with modified files', () => {
    const { getByText } = render(<ComponentStatusResolverWithModifiedFiles />);
    const textStatus = getByText(/^M$/);
    const textTooltip = getByText(/^Modified files$/);
    expect(textStatus).toBeInTheDocument();
    expect(textTooltip).toBeInTheDocument();
  });
  it('should render a new status with new component', () => {
    const { getByText } = render(<ComponentStatusResolverWithNewStatus />);
    const textStatus = getByText(/^N$/);
    const textTooltip = getByText(/^New component$/);
    expect(textStatus).toBeInTheDocument();
    expect(textTooltip).toBeInTheDocument();
  });
  it('should render a staged status with staged component', () => {
    const { getByText } = render(<ComponentStatusResolverWithStagedStatus />);
    const textStatus = getByText(/^S$/);
    const textTooltip = getByText(/^Staged component$/);
    expect(textStatus).toBeInTheDocument();
    expect(textTooltip).toBeInTheDocument();
  });
  it('should render a new status with issue', () => {
    const { getByText } = render(<ComponentStatusResolverWithNewStatusAndIssue />);
    const textStatus = getByText(/^N$/);
    const textTooltip = getByText(/^New component$/);
    const textTooltipIssue = getByText(/^1 issue found$/);
    expect(textStatus).toBeInTheDocument();
    expect(textTooltip).toBeInTheDocument();
    expect(textTooltipIssue).toBeInTheDocument();
  });
  it('should render a staged status with issue', () => {
    const { getByText } = render(<ComponentStatusResolverWithStagedStatusAndIssue />);
    const textStatus = getByText(/^S$/);
    const textTooltip = getByText(/^Staged component$/);
    const textTooltipIssue = getByText(/^1 issue found$/);
    expect(textStatus).toBeInTheDocument();
    expect(textTooltip).toBeInTheDocument();
    expect(textTooltipIssue).toBeInTheDocument();
  });

  it('should render a modified dependencies and files status with issue', () => {
    const { getByText } = render(<ComponentStatusResolverWithModifiedStatusAndIssue />);
    const textStatus = getByText(/^M$/);
    const textTooltipIssue = getByText(/^1 issue found$/);
    const textModifiedDependencies = getByText(/^Modified dependencies$/);
    const textModifiedFiles = getByText(/^Modified files$/);
    expect(textStatus).toBeInTheDocument();
    expect(textTooltipIssue).toBeInTheDocument();
    expect(textModifiedDependencies).toBeInTheDocument();
    expect(textModifiedFiles).toBeInTheDocument();
  });
});
