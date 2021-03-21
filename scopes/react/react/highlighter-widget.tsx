import React, { useState } from 'react';
import { PubsubUI } from '@teambit/pubsub';
import { HighlightToggler } from '@teambit/ui.highlight-toggler';
import { ToggleHighlightEvent } from '@teambit/ui.highlighter';

export function HighlighterWidget({ pubSub }: { pubSub: PubsubUI; }) {
	const [active, setActive] = useState(false);

	const handleHighlightToggle = (next: boolean) => {
		setActive(next);

		const event = new ToggleHighlightEvent(next);
		pubSub.pub(ToggleHighlightEvent.topic, event);
	};

	return <HighlightToggler active={active} onChange={handleHighlightToggle} />;
}
