
export async function fetchHtmlFromUrl(url: string) {
    return fetch(url)
        .then(response => response.text())
        .then(data => data)
}

export function createElementFromString(htmlString: string) {
    const htmlFragment = document.createRange().createContextualFragment(htmlString);
    return htmlFragment;
}

export function renderTemplate(target: HTMLElement, template: string) {
    target.appendChild(createElementFromString(template));
}