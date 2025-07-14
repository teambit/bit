import { simpleGit, CleanOptions } from 'simple-git';

export const git = simpleGit().clean(CleanOptions.FORCE);
