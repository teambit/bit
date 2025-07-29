import { AccountObj } from '@teambit/design.ui.avatar';

type SemVer = string;
type TimeStamp = string;
type ComponentID = string;

// TODO - @oded remove file

export enum JobStatus {
  fail = 'fail',
  pass = 'pass',
  running = 'running',
  pending = 'pending',
}

export type Component = {
  id: ComponentID;
  latest: SemVer;
};

// name is TBD
export type Version = {
  id: SemVer;
  timestamp: TimeStamp;
  labels?: string[];
  isLatest?: boolean;
  ciStatus: JobStatus;
  testStatus: JobStatus;
  message: string;
  contributors: AccountObj[];
};
