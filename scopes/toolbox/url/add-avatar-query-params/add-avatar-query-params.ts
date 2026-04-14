export function addAvatarQueryParams(
  url: string,
  size: string | number,
  defaultAvatarBgColor: string,
  widthStretch: boolean = true
) {
  if (!url) return url;

  const intSize = typeof size === 'string' ? parseInt(size) : size;
  const isQuestionExisting = url.indexOf('?') > -1;
  const controlChar = isQuestionExisting ? '&' : '?';
  const gravatarParams: string[] = [`size=${size}`];
  const imgixParams = [`h=${intSize * 2}`, `crop=faces`, `fit=crop`, `bg=${defaultAvatarBgColor}`];
  const widthParam = `w=${intSize * 2}`;

  const e: string[] = [];

  const params: string[] = e.concat(gravatarParams, imgixParams, widthStretch ? widthParam : []);

  return `${url}${controlChar}${params.join('&')}`;
}
