/**
 * these are the main group. legacy commands use only these groups.
 * Harmony commands can create new groups by calling `cliMain.registerGroup()`.
 */
export const groups = {
  start: 'Workspace & Project Setup',
  collaborate: 'Collaboration & Remote',
  discover: 'Information & Analysis',
  general: 'Workspace Tools',
  ungrouped: 'Ungrouped',
  'component-config': 'Component Configuration',
  dependencies: 'Dependencies & Packages',
  'version-control': 'Version Control',
  testing: 'Testing & Quality',
  'dev-tools': 'Development Tools',
  system: 'System & Utility',
  auth: 'Authentication & Cloud',
  advanced: 'Advanced/Debug',
};

export type Group = keyof typeof groups;

type GroupDescription = string;

export type GroupsType = { [groupName: string]: GroupDescription };
