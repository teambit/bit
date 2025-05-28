const oldGroups = {
  start: 'Start a working area',
  development: 'Develop components',
  discover: 'Explore components',
  info: 'View components',
  general: 'Workspace commands',
  ungrouped: 'Ungrouped',
};

/**
 * these are the main group. legacy commands use only these groups.
 * Harmony commands can create new groups by calling `cliMain.registerGroup()`.
 */
export const groups = {
  ...oldGroups,
  'workspace-setup': 'Workspace & Project Setup',
  collaborate: 'Collaboration & Remote',
  'info-analysis': 'Information & Analysis',
  'workspace-tools': 'Workspace Tools',
  'component-config': 'Component Configuration',
  'component-development': 'Component Development',
  dependencies: 'Dependencies & Packages',
  'version-control': 'Version Control',
  testing: 'Testing & Quality',
  'run-serve': 'Run & Serve',
  system: 'System & Utility',
  auth: 'Authentication & Cloud',
  advanced: 'Advanced/Debug',
};

export type Group = keyof typeof groups;

type GroupDescription = string;

export type GroupsType = { [groupName: string]: GroupDescription };
