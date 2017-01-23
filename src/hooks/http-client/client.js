/* @flow */
const requestify = require('requestify');

const client = {
  POST: (url: string, data: Object|string): Promise<any> => {
    return requestify.post(url, data);
  },
  GET: (url: string): Promise<any> => {
    return requestify.get(url);
  },
  DEL: (url: string): Promise<any> => {
    return requestify.delete(url);
  },
  PUT: (url: string, data: Object|string): Promise<any> => {
    return requestify.put(url, data);
  },
  HEAD: (url: string): Promise<any> => {
    return requestify.head(url);
  }
};

export default client;
