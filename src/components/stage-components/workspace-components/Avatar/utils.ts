import styles from './styles.module.scss';

export function getInitials(name: string) {
  if (!name) return '?';

  const words = name.split(' ');
  if (words.length > 1) {
    return words
      .slice(0, 2)
      .map((word) => word[0])
      .join('');
  }
  return name.slice(0, 2);
}

export function addQueryParams(url: string, size: string | number) {
  if (!url) return url;

  const isQuestionExisting = url.indexOf('?') > -1;
  const controlChar = isQuestionExisting ? '&' : '?';
  const gravatarParams: string[] = [`size=${size}`];
  const imgixParams = [`w=${size}`, `h=${size}`, `fill=fillmax`, `bg=${styles.defaultAvatarBgColor}`];

  const e: string[] = [];

  const params: string[] = e.concat(gravatarParams, imgixParams);

  return `${url}${controlChar}${params.join('&')}`;
}
