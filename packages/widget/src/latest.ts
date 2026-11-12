/**
 * Hands out request tokens of which only the newest counts. A request takes a
 * token when it starts and checks it after each await: when the reporter has
 * moved on (another conversation, back to the list), the older, slower answer
 * is dropped instead of being shown in place of the newer one.
 */
export class Latest {
	private current = 0;

	/** Starts a request; the function says whether it is still the newest. */
	next(): () => boolean {
		const id = ++this.current;
		return () => id === this.current;
	}

	/** Makes every request started so far stale. */
	cancel(): void {
		this.current++;
	}
}
