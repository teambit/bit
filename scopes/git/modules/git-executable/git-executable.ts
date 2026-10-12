import { getConfig } from '@teambit/config-store';
import { CFG_GIT_EXECUTABLE_PATH } from '@teambit/legacy.constants';
import * as definingExecutable from './git-executable';

export function getGitExecutablePath() {
  const executablePath = getConfig(CFG_GIT_EXECUTABLE_PATH);
  return executablePath || 'git';
}

const defaultGetConfig = getConfig;
const configModule = require('@teambit/config-store');
const configDescriptor = Object.getOwnPropertyDescriptor(configModule, 'getConfig');

/** Rust invokes the ordinary PATH Git binary; configured executables retain the public Node adapter. */
export function canUseDefaultGitNatively(): boolean {
  const current = Object.getOwnPropertyDescriptor(configModule, 'getConfig');
  if (
    !configDescriptor ||
    !current ||
    current.value !== configDescriptor.value ||
    current.get !== configDescriptor.get ||
    current.set !== configDescriptor.set ||
    current.enumerable !== configDescriptor.enumerable ||
    current.configurable !== configDescriptor.configurable ||
    current.writable !== configDescriptor.writable ||
    getConfig !== defaultGetConfig ||
    Object.getOwnPropertyDescriptor(definingExecutable, 'getGitExecutablePath')?.value !== getGitExecutablePath
  )
    return false;
  try {
    return getGitExecutablePath() === 'git';
  } catch {
    return false;
  }
}
