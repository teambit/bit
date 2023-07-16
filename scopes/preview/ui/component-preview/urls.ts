import type { ComponentModel } from '@teambit/component';
import { affix } from '@teambit/base-ui.utils.string.affix';

/**
 * generates a full url to a preview (overview / docs etc)
 */
export function toPreviewUrl(
  component: ComponentModel,
  previewName?: string,
  additionalParams?: string | string[],
  includeEnvId = true
) {
  const serverPath = toPreviewServer(component, previewName);
  const envId = getEnvIdQueryParam(component, includeEnvId);
  const hash = toPreviewHash(component, previewName, envId, additionalParams);

  return `${serverPath}#${hash}`;
}

/**
 * generates preview server path from component data
 */
export function toPreviewServer(component: ComponentModel, previewName?: string) {
  // explicit url is especially important for local workspace, because it's the url of the dev server.
  const explicitUrl = component.server?.url;
  // We use the explicit server url only if there is no host
  // we prefer host over url, because host is the host of the component server, and url is the dev server url.
  // this is required for backward compatibility with the cloud.
  if (explicitUrl && !component.server.host) return explicitUrl;

  // Checking specifically with === false, to make sure we fallback to the old url
  if (component.preview?.includesEnvTemplate === false) {
    // for example - "/api/teambit.community/envs/community-react@1.17.0/~aspect/env-template/overview"
    return toEnvTemplatePreviewUrl(component, previewName);
  }

  // (legacy)
  // for example - "/api/teambit.base-ui/input/button@0.6.2/~aspect/preview/"
  return toComponentPreviewUrl(component);
}

function getEnvIdQueryParam(component: ComponentModel, includeEnvId = true): string | undefined {
  if (!includeEnvId) return undefined;
  // This is remote host server, used by cloud, as opposed to local dev server host
  // which is under component.server.
  if (component.server?.host || component.server?.basePath) return undefined;
  // If there is no local dev server url, it means it's a scope and we don't need the env id.
  if (!component.server?.url) return undefined;
  return component.environment?.id;
}

/**
 * The old URL for components which their bundle contains the env template inside
 * @param component
 * @returns
 */
function toComponentPreviewUrl(component: ComponentModel) {
  const prefix = createPrefix(component.server?.basePath, component.server?.host);

  const componentBasedUrl = `${prefix}/${component.id.toString()}/~aspect/preview/`;
  return componentBasedUrl;
}

function createPrefix(basePath?: string, host?: string) {
  const actualBasePath = basePath || '/api';
  const basePathWithSlash = actualBasePath.startsWith('/') ? actualBasePath : `/${actualBasePath}`;
  const hostWithoutSlash = host?.endsWith('/') ? host.slice(0, -1) : host;
  const prefix = hostWithoutSlash ? `${hostWithoutSlash}${basePathWithSlash}` : basePathWithSlash;
  const prefixWithoutSlash = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
  return prefixWithoutSlash;
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
  // add component id for cache busting,
  // otherwise might have leftovers when switching between components of the same env.
  // This query param is currently not used yet.
  const search = `compId=${component.id.toString()}`;
  const prefix = createPrefix(component.server?.basePath, component.server?.host);

  const envBasedUrl = `${prefix}/${envId}/~aspect/env-template/${previewName}/?${search}`;
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
   * Environment ID of the component
   */
  envId?: string,
  /**
   * extra data to append to query
   */
  queryParams: string | string[] = ''
) {
  const previewParam = affix(`preview=`, previewName);
  const envIdParam = affix(`env=`, envId);

  const hashQuery = [previewParam, envIdParam]
    .concat(queryParams)
    .filter((x) => !!x) // also removes empty strings
    .join('&');

  const hash = `${component.id.toString()}${affix('?', hashQuery)}`;

  return hash;
}
