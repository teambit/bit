
export function renderTemplate(target: HTMLElement, template: string) {
    target.appendChild(createElementFromString(template));
}