import React, { useRef, useEffect } from 'react';
import { RenderHtmlComposition } from './utils';

/** adapter that converts html elements to react elements */

export function htmlToReact(element: HTMLElement) {
	return HtmlToReactAdapter;
	
	function HtmlToReactAdapter() {
		const ref = useRef<HTMLDivElement>(null);
		useEffect(() => { RenderHtmlComposition(ref.current, element) }, []);
		return <div ref={ref} />
	}
}
