import { HtmlComposition } from './interfaces';

export async function fetchHtmlFromUrl(url: string) {
    return fetch(url)
        .then(response => response.text())
        .then(data => data)
}

export function createElementFromString(htmlString: string) {
    const htmlFragment = document.createRange().createContextualFragment(htmlString);
    return htmlFragment;
}

export function renderTemplate(root: HTMLElement, template: string) {
    root.appendChild(createElementFromString(template));
}

/**
 * this mounts compositions into the DOM in the component preview.
 * this function can be overridden through ReactAspect.overrideCompositionsMounter() API
 * to apply custom logic for component DOM mounting.
 */
export const RenderHtmlComposition = (target: HTMLElement | null, composition: HtmlComposition) => {
    if (!target) return;

    // first clear the root node from any previous compositions. Required as all compositions
    // of a specific component are rendered in the same iframe
    target.innerHTML = '';

    if (composition instanceof Element || composition instanceof HTMLDocument) {
        target.appendChild(composition);
        return;
    }

    switch (typeof composition) {
        case 'function':
            composition(target);
            return;
        case 'string':
            renderTemplate(target, composition);
            return;
        default:
            return; // TODO error "this type of composition is not supported by the html env"

    }
};