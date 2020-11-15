/* eslint-disable no-undef */
import React from 'react';
import { render } from '@testing-library/react';
import {
  ComponentTooltipWithNewStatus,
  ComponentTooltipWithStagedStatus,
  ComponentTooltipWithModifiedFilesAndDependenciesStatus,
  ComponentTooltipWithModifiedFilesStatusAndIssues,
} from './component-tooltip.composition';

describe('Component Tooltip', () => {
  it('should render a tooltip with new component', () => {
    const { getByText } = render(<ComponentTooltipWithNewStatus />);
    const textTooltip = getByText(/^New component$/);
    // @ts-ignore
    expect(textTooltip).toBeInTheDocument();
  });
  it('should render a tooltip with staged component', () => {
    const { getByText } = render(<ComponentTooltipWithStagedStatus />);
    const textTooltip = getByText(/^Staged component$/);
    // @ts-ignore
    expect(textTooltip).toBeInTheDocument();
  });
  it('should render a tooltip with multiple status, modified dependencies and files', () => {
    const { getByText } = render(<ComponentTooltipWithModifiedFilesAndDependenciesStatus />);
    const textModifiedDependencies = getByText(/^Modified dependencies$/);
    const textModifiedFiles = getByText(/^Modified files$/);
    // @ts-ignore
    expect(textModifiedDependencies).toBeInTheDocument();
    // @ts-ignore
    expect(textModifiedFiles).toBeInTheDocument();
  });
  it('should render a tooltip with multiple status, modified files and 2 issues found', () => {
    const { getByText } = render(<ComponentTooltipWithModifiedFilesStatusAndIssues />);
    const textTooltip = getByText(/^Modified files$/);
    const textTooltipIssue = getByText(/^2 issues found$/);
    // @ts-ignore
    expect(textTooltip).toBeInTheDocument();
    // @ts-ignore
    expect(textTooltipIssue).toBeInTheDocument();
  });
});
