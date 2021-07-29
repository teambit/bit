export async function fetchHtmlFromUrl(url: string) {
  return fetch(url)
    .then((response) => response.text())
    .then((data) => data);
}
