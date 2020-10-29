export function queryString(params: { [key: string]: string | boolean }) {
  return Object.keys(params)
    .map((key) => `${key}=${params[key]}`)
    .join('&');
}
