import { getConfig } from '@teambit/config-store';
import { CFG_GIT_EXECUTABLE_PATH } from '@teambit/legacy.constants';
import { registerRustSnapshotFunctionReference } from '@teambit/objects';
import * as definingExecutable from './git-executable';

export function getGitExecutablePath() {
  const executablePath = getConfig(CFG_GIT_EXECUTABLE_PATH);
  return executablePath || 'git';
}

const configModule = require('@teambit/config-store');
const configDescriptor = Object.getOwnPropertyDescriptor(configModule, 'getConfig');
const definingConfig = require('@teambit/config-store/dist/config-getter.js');
const definingConfigDescriptor = Object.getOwnPropertyDescriptor(definingConfig, 'getConfig');
// Read the DATA descriptor rather than a re-export, which may delegate to a replaced accessor.
const defaultGetConfig = definingConfigDescriptor?.value;

/** Rust invokes the ordinary PATH Git binary; configured executables retain the public Node adapter. */
export function canUseDefaultGitNatively(): boolean {
  const current = Object.getOwnPropertyDescriptor(configModule, 'getConfig');
  const definingCurrent = Object.getOwnPropertyDescriptor(definingConfig, 'getConfig');
  if (
    !definingConfigDescriptor ||
    !('value' in definingConfigDescriptor) ||
    typeof defaultGetConfig !== 'function' ||
    !definingCurrent ||
    !('value' in definingCurrent) ||
    definingCurrent.value !== defaultGetConfig ||
    definingCurrent.enumerable !== definingConfigDescriptor.enumerable ||
    definingCurrent.configurable !== definingConfigDescriptor.configurable ||
    definingCurrent.writable !== definingConfigDescriptor.writable ||
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
registerRustSnapshotFunctionReference('HistoryQueryGitEligibility', canUseDefaultGitNatively);
