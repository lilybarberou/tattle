import { useEffect, useRef, useState } from "react";

/**
 * An "Are you sure?" shown in place of the button that asked it. The button
 * leaves the page while the question shows, so keyboard focus would fall
 * back to the top of the page: focus goes to the question's safe answer
 * (`cancel`), then back to the button when the question closes.
 */
export function useInlineConfirm() {
	const [confirming, setConfirming] = useState(false);
	const trigger = useRef<HTMLButtonElement>(null);
	const cancel = useRef<HTMLButtonElement>(null);
	const wasConfirming = useRef(false);
	useEffect(() => {
		if (confirming) cancel.current?.focus();
		else if (wasConfirming.current) trigger.current?.focus();
		wasConfirming.current = confirming;
	}, [confirming]);
	return { confirming, setConfirming, trigger, cancel };
}
