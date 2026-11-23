/** Compare native and retained class directory spellings without resolving filesystem aliases. */
function installationDirectoryEquals(actual, requested, pathApi = path) {
  return typeof actual === 'string' && typeof requested === 'string'
    && pathApi.isAbsolute(actual) && pathApi.isAbsolute(requested)
    && pathApi.resolve(actual) === pathApi.resolve(requested);
}
