"use client";

import { useEffect, useRef, useState } from "react";

/** The 44-second promo, as a muted loop that plays only while it is on screen. */
export function Promo() {
	const video = useRef<HTMLVideoElement>(null);
	const [playing, setPlaying] = useState(false);
	const [userPaused, setUserPaused] = useState(false);

	useEffect(() => {
		const v = video.current;
		if (!v) return;
		if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
		const io = new IntersectionObserver(
			([entry]) => {
				if (entry.isIntersecting && !userPaused) void v.play().catch(() => {});
				else v.pause();
			},
			{ threshold: 0.35 },
		);
		io.observe(v);
		return () => io.disconnect();
	}, [userPaused]);

	const toggle = () => {
		const v = video.current;
		if (!v) return;
		if (v.paused) {
			setUserPaused(false);
			void v.play();
		} else {
			setUserPaused(true);
			v.pause();
		}
	};

	return (
		<figure className="pr-media" data-reveal-item>
			<video
				ref={video}
				src="/media/promo.mp4"
				poster="/media/promo-poster.jpg"
				width={1600}
				height={900}
				muted
				loop
				playsInline
				preload="metadata"
				onPlay={() => setPlaying(true)}
				onPause={() => setPlaying(false)}
				aria-label="Vidéo : Marie signale un paiement bloqué sur la boutique Lune, le rapport arrive avec son contexte, l'équipe le trie, une pull request le corrige."
			/>
			<button
				type="button"
				className="pr-toggle"
				onClick={toggle}
				aria-pressed={!playing}
			>
				{playing ? "Pause" : "Lire la vidéo"}
			</button>
		</figure>
	);
}
