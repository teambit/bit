export function addAvatarQueryParams(url: string, size: string | number, defaultAvatarBgColor: string) {
  if (!url) return url;

  const intSize = typeof size === 'string' ? parseInt(size) : size;
  const isQuestionExisting = url.indexOf('?') > -1;
  const controlChar = isQuestionExisting ? '&' : '?';
  const gravatarParams: string[] = [`size=${size}`];
  const imgixParams = [`w=${intSize*2}`, `h=${intSize*2}`, `crop=faces`, `fit=crop`, `bg=${defaultAvatarBgColor}`];

  const e: string[] = [];

  const params: string[] = e.concat(gravatarParams, imgixParams);

  return `${url}${controlChar}${params.join('&')}`;
}
