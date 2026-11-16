"use client";

import { useEffect } from "react";

/**
 * Section entrances: every `[data-reveal]` element rises into place the first
 * time it enters the viewport. Children marked `[data-reveal-item]` follow one
 * another 70ms apart. CSS hides them only under `html.js`, and only without
 * prefers-reduced-motion, so nothing stays hidden if this never runs.
 */
export function Reveal() {
	useEffect(() => {
		const groups = Array.from(
			document.querySelectorAll<HTMLElement>("[data-reveal]"),
		);
		for (const group of groups) {
			group
				.querySelectorAll<HTMLElement>("[data-reveal-item]")
				.forEach((item, i) => {
					item.style.setProperty("--i", String(i));
				});
		}
		const io = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (!entry.isIntersecting) continue;
					entry.target.classList.add("is-in");
					io.unobserve(entry.target);
				}
			},
			{ rootMargin: "0px 0px -12% 0px", threshold: 0.05 },
		);
		for (const group of groups) io.observe(group);
		document.documentElement.classList.add("reveal-ready");
		return () => io.disconnect();
	}, []);
	return null;
}
