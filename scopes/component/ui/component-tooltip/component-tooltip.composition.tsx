import React from 'react';
import { ThemeCompositions } from '@teambit/documenter.theme.theme-compositions';
import { ComponentStatus as StatusProps } from '@teambit/workspace';
import { StatusTooltip } from './component-tooltip';

let id = 0;
const getCompId = () => {
  id += 1;
  return id.toString();
};

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
  const compName = getCompId();
  return (
    <ThemeCompositions style={style}>
      <div data-tip="" data-for={compName}>
        N
        <StatusTooltip status={compStatus} name={compName} />
      </div>
    </ThemeCompositions>
  );
};

export const ComponentTooltipWithStagedStatus = () => {
  resetValues();
  isStaged = true;
  const compStatus = new StatusProps(modifyInfo, isNew, isDeleted, isStaged, isInWorkspace, isInScope, nested);
  const compName = getCompId();
  return (
    <ThemeCompositions style={style}>
      <div data-tip="" data-for={compName}>
        S
        <StatusTooltip status={compStatus} name={compName} />
      </div>
    </ThemeCompositions>
  );
};

export const ComponentTooltipWithModifiedFilesAndDependenciesStatus = () => {
  resetValues();
  modifyInfo.hasModifiedDependencies = true;
  modifyInfo.hasModifiedFiles = true;
  const compStatus = new StatusProps(modifyInfo, isNew, isDeleted, isStaged, isInWorkspace, isInScope, nested);
  const compName = getCompId();
  return (
    <ThemeCompositions style={style}>
      <div data-tip="" data-for={compName}>
        M
        <StatusTooltip status={compStatus} name={compName} />
      </div>
    </ThemeCompositions>
  );
};

export const ComponentTooltipWithModifiedFilesStatusAndIssues = () => {
  resetValues();
  modifyInfo.hasModifiedFiles = true;
  const compStatus = new StatusProps(modifyInfo, isNew, isDeleted, isStaged, isInWorkspace, isInScope, nested);
  const compName = getCompId();
  return (
    <ThemeCompositions style={style}>
      <div data-tip="" data-for={compName}>
        M
        <StatusTooltip status={compStatus} name={compName} issuesCount={2} />
      </div>
    </ThemeCompositions>
  );
};
