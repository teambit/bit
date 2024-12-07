/**
 * these are the main group. legacy commands use only these groups.
 * Harmony commands can create new groups by calling `cliMain.registerGroup()`.
 */
export const groups = {
  start: 'Start a working area',
  development: 'Develop components',
  collaborate: 'Collaborate on components',
  discover: 'Explore components',
  info: 'View components',
  general: 'Workspace commands',
  ungrouped: 'Ungrouped',
};

export type Group = keyof typeof groups;

type GroupDescription = string;

export type GroupsType = { [groupName: string]: GroupDescription };
