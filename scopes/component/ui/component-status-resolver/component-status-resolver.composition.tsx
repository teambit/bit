import React from 'react';
import { ThemeCompositions } from '@teambit/documenter.theme.theme-compositions';
import { ComponentStatus as StatusProps } from '@teambit/workspace';
import { ComponentStatusResolver } from './component-status-resolver';

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

export const ComponentStatusResolverWithModifiedDependencies = () => {
  resetValues();
  modifyInfo.hasModifiedDependencies = true;
  const compStatus = new StatusProps(modifyInfo, isNew, isDeleted, isStaged, isInWorkspace, isInScope, nested);
  return (
    <ThemeCompositions style={style}>
      <ComponentStatusResolver status={compStatus} />
    </ThemeCompositions>
  );
};

export const ComponentStatusResolverWithModifiedFiles = () => {
  resetValues();
  modifyInfo.hasModifiedFiles = true;
  const compStatus = new StatusProps(modifyInfo, isNew, isDeleted, isStaged, isInWorkspace, isInScope, nested);
  return (
    <ThemeCompositions style={style}>
      <ComponentStatusResolver status={compStatus} />
    </ThemeCompositions>
  );
};

export const ComponentStatusResolverWithNewStatus = () => {
  resetValues();
  isNew = true;
  const compStatus = new StatusProps(modifyInfo, isNew, isDeleted, isStaged, isInWorkspace, isInScope, nested);
  return (
    <ThemeCompositions style={style}>
      <ComponentStatusResolver status={compStatus} />
    </ThemeCompositions>
  );
};

export const ComponentStatusResolverWithStagedStatus = () => {
  resetValues();
  isStaged = true;
  const compStatus = new StatusProps(modifyInfo, isNew, isDeleted, isStaged, isInWorkspace, isInScope, nested);
  return (
    <ThemeCompositions style={style}>
      <ComponentStatusResolver status={compStatus} />
    </ThemeCompositions>
  );
};

export const ComponentStatusResolverWithNewStatusAndIssue = () => {
  resetValues();
  isNew = true;
  const compStatus = new StatusProps(modifyInfo, isNew, isDeleted, isStaged, isInWorkspace, isInScope, nested);
  return (
    <ThemeCompositions style={style}>
      <ComponentStatusResolver status={compStatus} issuesCount={1} />
    </ThemeCompositions>
  );
};

export const ComponentStatusResolverWithStagedStatusAndIssue = () => {
  resetValues();
  isStaged = true;
  const compStatus = new StatusProps(modifyInfo, isNew, isDeleted, isStaged, isInWorkspace, isInScope, nested);
  return (
    <ThemeCompositions style={style}>
      <ComponentStatusResolver status={compStatus} issuesCount={1} />
    </ThemeCompositions>
  );
};

export const ComponentStatusResolverWithModifiedStatusAndIssue = () => {
  resetValues();
  modifyInfo.hasModifiedFiles = true;
  modifyInfo.hasModifiedDependencies = true;
  const compStatus = new StatusProps(modifyInfo, isNew, isDeleted, isStaged, isInWorkspace, isInScope, nested);
  return (
    <ThemeCompositions style={style}>
      <ComponentStatusResolver status={compStatus} issuesCount={1} />
    </ThemeCompositions>
  );
};
