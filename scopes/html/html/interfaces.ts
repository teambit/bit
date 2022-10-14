export type HtmlFunctionComposition = (element: HTMLElement) => void;

export type HtmlComposition = HtmlFunctionComposition | string | Element | HTMLDocument;
