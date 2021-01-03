import React from 'react';
import { ThemeCompositions } from '@teambit/documenter.theme.theme-compositions';
import { ComponentID } from '@teambit/component';
import { ComponentStatus as StatusProps } from '@teambit/workspace';
import { ComponentStatusResolver } from './component-status-resolver';

let id = 0;
const getCompId = () => {
  id += 1;
  // @ts-ignore
  return new ComponentID({ name: `ui/component-status-resolver-${id}` }, 'teambit.component');
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

export const ComponentStatusResolverWithModifiedDependencies = () => {
  resetValues();
  modifyInfo.hasModifiedDependencies = true;
  const compStatus = new StatusProps(modifyInfo, isNew, isDeleted, isStaged, isInWorkspace, isInScope, nested);
  return (
    <ThemeCompositions>
      <ComponentStatusResolver id={getCompId()} status={compStatus} />
    </ThemeCompositions>
  );
};

export const ComponentStatusResolverWithModifiedFiles = () => {
  resetValues();
  modifyInfo.hasModifiedFiles = true;
  const compStatus = new StatusProps(modifyInfo, isNew, isDeleted, isStaged, isInWorkspace, isInScope, nested);
  return (
    <ThemeCompositions>
      <ComponentStatusResolver id={getCompId()} status={compStatus} />
    </ThemeCompositions>
  );
};

export const ComponentStatusResolverWithNewStatus = () => {
  resetValues();
  isNew = true;
  const compStatus = new StatusProps(modifyInfo, isNew, isDeleted, isStaged, isInWorkspace, isInScope, nested);
  return (
    <ThemeCompositions>
      <ComponentStatusResolver id={getCompId()} status={compStatus} />
    </ThemeCompositions>
  );
};

export const ComponentStatusResolverWithStagedStatus = () => {
  resetValues();
  isStaged = true;
  const compStatus = new StatusProps(modifyInfo, isNew, isDeleted, isStaged, isInWorkspace, isInScope, nested);
  return (
    <ThemeCompositions>
      <ComponentStatusResolver id={getCompId()} status={compStatus} />
    </ThemeCompositions>
  );
};

export const ComponentStatusResolverWithNewStatusAndIssue = () => {
  resetValues();
  isNew = true;
  const compStatus = new StatusProps(modifyInfo, isNew, isDeleted, isStaged, isInWorkspace, isInScope, nested);
  return (
    <ThemeCompositions>
      <ComponentStatusResolver id={getCompId()} status={compStatus} issuesCount={1} />
    </ThemeCompositions>
  );
};

export const ComponentStatusResolverWithStagedStatusAndIssue = () => {
  resetValues();
  isStaged = true;
  const compStatus = new StatusProps(modifyInfo, isNew, isDeleted, isStaged, isInWorkspace, isInScope, nested);
  return (
    <ThemeCompositions>
      <ComponentStatusResolver id={getCompId()} status={compStatus} issuesCount={1} />
    </ThemeCompositions>
  );
};

export const ComponentStatusResolverWithModifiedStatusAndIssue = () => {
  resetValues();
  modifyInfo.hasModifiedFiles = true;
  modifyInfo.hasModifiedDependencies = true;
  const compStatus = new StatusProps(modifyInfo, isNew, isDeleted, isStaged, isInWorkspace, isInScope, nested);
  return (
    <ThemeCompositions>
      <ComponentStatusResolver id={getCompId()} status={compStatus} issuesCount={1} />
    </ThemeCompositions>
  );
};

const compositions = [
  ComponentStatusResolverWithModifiedDependencies,
  ComponentStatusResolverWithModifiedFiles,
  ComponentStatusResolverWithNewStatus,
  ComponentStatusResolverWithStagedStatus,
  ComponentStatusResolverWithNewStatusAndIssue,
  ComponentStatusResolverWithStagedStatusAndIssue,
  ComponentStatusResolverWithModifiedStatusAndIssue,
];
// @ts-ignore
compositions.map((comp) => (comp.canvas = { height: 90 }));
