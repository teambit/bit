export const CORE_ENV_PREVIEW_CAPABILITIES = { onlyOverview: true, useNameParam: true };

export function coreEnvDoesScaling(isNew: boolean, isBundledWithEnv: boolean): boolean {
  return isNew || !isBundledWithEnv;
}
