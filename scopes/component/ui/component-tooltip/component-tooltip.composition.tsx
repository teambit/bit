import React from 'react';
import { ThemeCompositions } from '@teambit/documenter.theme.theme-compositions';
import { ComponentStatus as StatusProps } from '@teambit/workspace';
import { StatusTooltip } from './component-tooltip';

let modifyInfo = { hasModifiedFiles: false, hasModifiedDependencies: false };
let isNew = false;
let isDeleted = false;
let isStaged = false;
let isInWorkspace = false;
let isInScope = false;
let nested = false;

const resetValues = () => {
  modifyInfo = { hasModifiedFiles: false, hasModifiedDependencies: false };
  isNew = false;
  isDeleted = false;
  isStaged = false;
  isInWorkspace = false;
  isInScope = false;
  nested = false;
};

const style = { display: 'flex', justifyContent: 'center', alignContent: 'center' };

export const ComponentTooltipWithNewStatus = () => {
  resetValues();
  isNew = true;
  const compStatus = new StatusProps(modifyInfo, isNew, isDeleted, isStaged, isInWorkspace, isInScope, nested);

  return (
    <ThemeCompositions style={style}>
      <StatusTooltip status={compStatus}>N</StatusTooltip>
    </ThemeCompositions>
  );
};

export const ComponentTooltipWithStagedStatus = () => {
  resetValues();
  isStaged = true;
  const compStatus = new StatusProps(modifyInfo, isNew, isDeleted, isStaged, isInWorkspace, isInScope, nested);

  return (
    <ThemeCompositions style={style}>
      <StatusTooltip status={compStatus}>S</StatusTooltip>
    </ThemeCompositions>
  );
};

export const ComponentTooltipWithModifiedFilesAndDependenciesStatus = () => {
  resetValues();
  modifyInfo.hasModifiedDependencies = true;
  modifyInfo.hasModifiedFiles = true;
  const compStatus = new StatusProps(modifyInfo, isNew, isDeleted, isStaged, isInWorkspace, isInScope, nested);

  return (
    <ThemeCompositions style={style}>
      <StatusTooltip status={compStatus}>M</StatusTooltip>
    </ThemeCompositions>
  );
};

export const ComponentTooltipWithModifiedFilesStatusAndIssues = () => {
  resetValues();
  modifyInfo.hasModifiedFiles = true;
  const compStatus = new StatusProps(modifyInfo, isNew, isDeleted, isStaged, isInWorkspace, isInScope, nested);

  return (
    <ThemeCompositions style={style}>
      <StatusTooltip status={compStatus} issuesCount={2}>
        M
      </StatusTooltip>
    </ThemeCompositions>
  );
};
