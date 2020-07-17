import { Version, JobStatus, AccountTypes } from '../../stage-components/workspace-page/change-log.data';

export const versionExample1: Version = {
  id: '1.1.0',
  time: '2019-12-31 23:02:51.561Z',
  ciStatus: JobStatus.fail,
  testStatus: JobStatus.pass,
  message: 'Support overrides of the workspace defaultScope per components',
  isLatest: true,
  contributors: {
    name: 'oded',
    accountType: AccountTypes.user,
    profileImage:
      'https://bitsrc.imgix.net/11b8acfbc5f7a64c0ecec1e2a8d4b4866eaf4431.png?size=41&w=41&h=41&fill=fillmax&bg=fff',
  },
};
export const versionExample2: Version = {
  id: '1.0.1',
  time: '2020-01-31 23:02:51.561Z',
  ciStatus: JobStatus.fail,
  testStatus: JobStatus.pass,
  message:
    'Support overrides of the workspace defaultScope per components Use workspaces default Scope to generate node-modules links for pre-export components',
  contributors: {
    name: 'oded',
    accountType: AccountTypes.user,
    profileImage:
      'https://bitsrc.imgix.net/11b8acfbc5f7a64c0ecec1e2a8d4b4866eaf4431.png?size=41&w=41&h=41&fill=fillmax&bg=fff',
  },
};
export const versionExample3: Version = {
  id: '1.0.0',
  time: '2020-04-31 23:02:51.561Z',
  ciStatus: JobStatus.fail,
  testStatus: JobStatus.pass,
  message: 'Support overrides of the workspace defaultScope per components',
  contributors: {
    name: 'oded',
    accountType: AccountTypes.user,
    profileImage:
      'https://bitsrc.imgix.net/11b8acfbc5f7a64c0ecec1e2a8d4b4866eaf4431.png?size=41&w=41&h=41&fill=fillmax&bg=fff',
  },
};

export const versionsArray: Version[] = [versionExample1, versionExample2, versionExample3];
