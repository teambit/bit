// Warnings
export const UNABLE_TO_LOAD_EXTENSION = (id: string) =>
  `error: unable to load the extension "${id}", please use the '--log' flag for the full error.`;
export const UNABLE_TO_LOAD_EXTENSION_FROM_LIST = (ids: string[]) =>
  `couldn't load one of the following extensions ${ids.join(', ')}, please use the '--log' flag for the full error.`;
