export const UNABLE_TO_LOAD_EXTENSION = (id: string, errMsg?: string) =>
  `error: unable to load the extension "${id}", due to an error "${
    errMsg || '<unknown-error>'
  }", please use the '--log=error' flag for the full error.`;
export const UNABLE_TO_LOAD_EXTENSION_FROM_LIST = (ids: string[], errMsg?: string) =>
  `couldn't load one of the following extensions ${ids.join(', ')}, due to an error "${
    errMsg || '<unknown-error>'
  }", please use the '--log=error' flag for the full error.`;
