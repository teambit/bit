import type { ComponentModel } from '@teambit/component';
import { affix } from '@teambit/base-ui.utils.string.affix';

/**
 * generates a full url to a preview (overview / docs etc)
 */
export function toPreviewUrl(component: ComponentModel, previewName?: string, additionalParams?: string | string[]) {
  const serverPath = toPreviewServer(component, previewName);
  const hash = toPreviewHash(component, previewName, additionalParams);

  return `${serverPath}#${hash}`;
}

/**
 * generates preview server path from component data
 */
export function toPreviewServer(component: ComponentModel, previewName?: string) {
  let explicitUrl = component.server?.url;
  // quickfix - preview urls in `start` (without `--dev`) won't work without trailing '/'
  if (explicitUrl && !explicitUrl.endsWith('/')) explicitUrl += '/';

  // fallback url for all components. Includes versions support
  // for example -
  //  envUrl       - "/api/teambit.community/envs/community-react@1.17.0/~aspect/env-template/overview"
  //  componentUrl - "/api/teambit.base-ui/input/button@0.6.2/~aspect/preview/"
  // Checking specifically with === false, to make sure we fallback to the old url
  const defaultServerUrl =
    component.preview?.includesEnvTemplate === false
      ? toEnvTemplatePreviewUrl(component, previewName)
      : toComponentPreviewUrl(component);

  return explicitUrl || defaultServerUrl;
}

/**
 * The old URL for components which their bundle contains the env template inside
 * @param component
 * @returns
 */
function toComponentPreviewUrl(component: ComponentModel) {
  const componentBasedUrl = `/api/${component.id.toString()}/~aspect/preview/`;
  return componentBasedUrl;
}

/**
 * Optimized URL when the env template is in separate bundle
 * We fetched it by the env id so we can achieve long term cache of the env template bundles in the browser
 * @param component
 * @param previewName
 * @returns
 */
function toEnvTemplatePreviewUrl(component: ComponentModel, previewName?: string) {
  const envId = component.environment?.id;
  const envBasedUrl = `/api/${envId}/~aspect/env-template/${previewName}/`;
  return envBasedUrl;
}

/**
 * creates component preview arguments
 */
export function toPreviewHash(
  /**
   * component to preview
   */
  component: ComponentModel,
  /**
   * current preview (docs, compositions, etc)
   */
  previewName?: string,
  /**
   * extra data to append to query
   */
  queryParams: string | string[] = ''
) {
  const previewParam = affix(`preview=`, previewName);

  const hashQuery = [previewParam]
    .concat(queryParams)
    .filter((x) => !!x) // also removes empty strings
    .join('&');

  const hash = `${component.id.toString()}${affix('?', hashQuery)}`;

  return hash;
}
