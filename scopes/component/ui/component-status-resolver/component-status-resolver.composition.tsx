import React from 'react';
import { ThemeContext } from '@teambit/documenter.theme.theme-context';
import { ComponentID } from '@teambit/component';
import { ComponentStatus as StatusProps } from '@teambit/workspace';
import { ComponentStatusResolver } from './component-status-resolver';
import { Center } from './component-status-resolver.docs';

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
    <ThemeContext>
      <Center>
        <ComponentStatusResolver id={getCompId()} status={compStatus} />
      </Center>
    </ThemeContext>
  );
};

export const ComponentStatusResolverWithModifiedFiles = () => {
  resetValues();
  modifyInfo.hasModifiedFiles = true;
  const compStatus = new StatusProps(modifyInfo, isNew, isDeleted, isStaged, isInWorkspace, isInScope, nested);
  return (
    <ThemeContext>
      <Center>
        <ComponentStatusResolver id={getCompId()} status={compStatus} />
      </Center>
    </ThemeContext>
  );
};

export const ComponentStatusResolverWithNewStatus = () => {
  resetValues();
  isNew = true;
  const compStatus = new StatusProps(modifyInfo, isNew, isDeleted, isStaged, isInWorkspace, isInScope, nested);
  return (
    <ThemeContext>
      <Center>
        <ComponentStatusResolver id={getCompId()} status={compStatus} />
      </Center>
    </ThemeContext>
  );
};

export const ComponentStatusResolverWithStagedStatus = () => {
  resetValues();
  isStaged = true;
  const compStatus = new StatusProps(modifyInfo, isNew, isDeleted, isStaged, isInWorkspace, isInScope, nested);
  return (
    <ThemeContext>
      <Center>
        <ComponentStatusResolver id={getCompId()} status={compStatus} />
      </Center>
    </ThemeContext>
  );
};

export const ComponentStatusResolverWithNewStatusAndIssue = () => {
  resetValues();
  isNew = true;
  const compStatus = new StatusProps(modifyInfo, isNew, isDeleted, isStaged, isInWorkspace, isInScope, nested);
  return (
    <ThemeContext>
      <Center>
        <ComponentStatusResolver id={getCompId()} status={compStatus} issuesCount={1} />
      </Center>
    </ThemeContext>
  );
};

export const ComponentStatusResolverWithStagedStatusAndIssue = () => {
  resetValues();
  isStaged = true;
  const compStatus = new StatusProps(modifyInfo, isNew, isDeleted, isStaged, isInWorkspace, isInScope, nested);
  return (
    <ThemeContext>
      <Center>
        <ComponentStatusResolver id={getCompId()} status={compStatus} issuesCount={1} />
      </Center>
    </ThemeContext>
  );
};

export const ComponentStatusResolverWithModifiedStatusAndIssue = () => {
  resetValues();
  modifyInfo.hasModifiedFiles = true;
  modifyInfo.hasModifiedDependencies = true;
  const compStatus = new StatusProps(modifyInfo, isNew, isDeleted, isStaged, isInWorkspace, isInScope, nested);
  return (
    <ThemeContext>
      <Center>
        <ComponentStatusResolver id={getCompId()} status={compStatus} issuesCount={1} />
      </Center>
    </ThemeContext>
  );
};
