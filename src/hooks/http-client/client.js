/* @flow */
const requestify = require('requestify');

const client = {
  POST: (url: string, data: object|string): Promise<any> => {
    return requestify.post(url, data);
  },
  GET: (url: string): Promise<any> => {
    return requestify.get(url);
  },
  DEL: (url: string): Promise<any> => {
    return requestify.delete(url);
  },
  PUT: (url: string, data: object|string): Promise<any> => {
    requestify.put(url, data);
  },
  HEAD: (url: string): Promise<any> => {
    requestify.head(url);
  }
};

export default client;
