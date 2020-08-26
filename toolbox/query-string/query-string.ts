export function queryString(params: { [key: string]: string }) {
  return Object.keys(params)
    .map((key) => `${key}=${params[key]}`)
    .join('&');
}
