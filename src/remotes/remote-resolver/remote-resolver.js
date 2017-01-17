/* @flow */
const remoteResolver = (scopeName: string): Promise<string> => {
  const hubPrefix = 'ssh://bit@hub.bitsrc.io:';
  return Promise.resolve(hubPrefix + scopeName);
};

export default remoteResolver;
