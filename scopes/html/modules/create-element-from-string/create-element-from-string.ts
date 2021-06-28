export function createElementFromString(htmlString: string) {
  const htmlFragment = document.createRange().createContextualFragment(htmlString);
  return htmlFragment;
}
