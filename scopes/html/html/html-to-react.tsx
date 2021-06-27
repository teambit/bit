import React, { useRef, useEffect } from 'react';
import { RenderHtmlComposition } from './render-composition';

/**
 * Adapter that converts html elements to react elements 
 * @param element 
 */
export function htmlToReact(element: HTMLElement) {
	return () => {
		const ref = useRef<HTMLDivElement>(null);
		useEffect(() => { RenderHtmlComposition(ref.current, element) }, []);
		return <div ref={ref} />
	}
}
