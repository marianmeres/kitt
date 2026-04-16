import { createTickerRAF } from "@marianmeres/ticker";

/** Target selector or element(s) for the animation. */
export type KittTarget = string | Element | NodeList | ArrayLike<Element>;

/** Sweep direction: single pass left-to-right, right-to-left, or bouncing. */
export type KittDirection = "ltr" | "rtl" | "pingpong";

/** Built-in event triggers wired automatically by the lib. */
export type KittTrigger = "hover" | "click" | "visible";

/** Optional auto-replay scheduling. */
export interface KittScheduleConfig {
	/** Delay before the first scheduled `play()`. Defaults to 3000 ms. */
	initialDelay?: number;
	/**
	 * Interval between scheduled replays.
	 * - Number: fixed delay in ms.
	 * - Tuple `[min, max]`: random delay in that range (inclusive) each time.
	 * Defaults to `[5000, 10000]`.
	 */
	interval?: number | [number, number];
	/** If true, re-schedule after each play. Defaults to true. */
	repeat?: boolean;
}

/**
 * Configuration for {@link kitt}.
 *
 * Only `target` is required; every other field has a sensible default
 * documented inline. See the field-level JSDoc for accepted values.
 */
export interface KittConfig {
	/**
	 * CSS selector, Element, NodeList, or array of elements.
	 * - String: queried against `document` (or as a container when `itemSelector` is set).
	 * - Element: treated as a container; items = `itemSelector` children or direct children.
	 * - NodeList / Array: used directly as the items to animate.
	 */
	target: KittTarget;
	/** When `target` resolves to a container element, select children with this selector. */
	itemSelector?: string;
	/** Tick interval in ms, passed to `createTickerRAF`. Defaults to 70. */
	interval?: number;
	/** Trail length behind/ahead of the head. Defaults to `trail.length - 1`. */
	tailLength?: number;
	/** CSS property to write on each element. Defaults to `"color"`. */
	property?: string;
	/** Value written when an element is "off". Defaults to `"inherit"`. */
	baseValue?: string;
	/**
	 * Values for the scanner gradient. `trail[0]` is the head (brightest),
	 * subsequent entries dim progressively. Defaults to a red KITT-style gradient.
	 */
	trail?: string[];
	/** Sweep direction. Defaults to `"pingpong"`. */
	direction?: KittDirection;
	/** Full passes per `play()` call. Use `Infinity` to loop until stopped. Defaults to 1. */
	cycles?: number;
	/** Call `play()` on creation. Defaults to false. */
	autoStart?: boolean;
	/** Auto-replay configuration. Pass `false` or omit to disable. */
	schedule?: KittScheduleConfig | false;
	/** DOM event triggers to wire on the resolved container. */
	triggers?: KittTrigger[];
	/** Honor `prefers-reduced-motion: reduce`. Defaults to true. */
	respectReducedMotion?: boolean;
	/** Called when a `play()` run begins. */
	onStart?: () => void;
	/** Called when a `play()` run completes naturally (not after `stop()`). */
	onEnd?: () => void;
	/** Called on each tick with the head index and current sweep phase. */
	onTick?: (headIndex: number, phase: "ltr" | "rtl") => void;
}

/**
 * Imperative handle returned by {@link kitt}.
 *
 * Use to play, stop, toggle, query state, or fully tear down the scanner
 * (cancelling timers and detaching trigger listeners).
 */
export interface KittHandle {
	/** Start a run. No-op if already playing or reduced motion is active. */
	play: () => void;
	/** Stop immediately and reset all elements to `baseValue`. */
	stop: () => void;
	/** Play if stopped, stop if playing. */
	toggle: () => void;
	/** Whether the ticker is currently running. */
	isPlaying: () => boolean;
	/** Stop, clear any scheduled replay, and remove trigger listeners. */
	destroy: () => void;
}

const DEFAULT_TRAIL: string[] = [
	"rgb(255, 0, 0)",
	"rgb(153, 0, 0)",
	"rgb(51, 0, 0)",
];

function isElement(x: unknown): x is Element {
	const E = (globalThis as { Element?: typeof Element }).Element;
	return typeof E === "function" && x instanceof E;
}

function resolveContainer(target: KittTarget): Element | null {
	if (typeof target === "string") {
		const doc = (globalThis as { document?: Document }).document;
		return doc ? doc.querySelector(target) : null;
	}
	if (isElement(target)) return target;
	return null;
}

function resolveElements(
	target: KittTarget,
	itemSelector: string | undefined,
): HTMLElement[] {
	if (typeof target === "string") {
		const doc = (globalThis as { document?: Document }).document;
		if (!doc) return [];
		if (itemSelector) {
			const root = doc.querySelector(target);
			return root
				? (Array.from(
						root.querySelectorAll(itemSelector),
					) as HTMLElement[])
				: [];
		}
		return Array.from(doc.querySelectorAll(target)) as HTMLElement[];
	}
	if (isElement(target)) {
		if (itemSelector) {
			return Array.from(
				target.querySelectorAll(itemSelector),
			) as HTMLElement[];
		}
		return Array.from(target.children) as HTMLElement[];
	}
	return Array.from(target as ArrayLike<Element>) as HTMLElement[];
}

function randomInt(min: number, max: number): number {
	const a = Math.ceil(min);
	const b = Math.floor(max);
	return Math.floor(Math.random() * (b - a + 1) + a);
}

function prefersReducedMotion(): boolean {
	if (typeof globalThis === "undefined") return false;
	const mm = (
		globalThis as { matchMedia?: (q: string) => { matches: boolean } }
	).matchMedia;
	if (typeof mm !== "function") return false;
	return mm("(prefers-reduced-motion: reduce)").matches;
}

function setStyle(el: HTMLElement, property: string, value: string) {
	if (property.includes("-")) {
		el.style.setProperty(property, value);
	} else {
		(el.style as unknown as Record<string, string>)[property] = value;
	}
}

type Frame = [number, number];

// One pingpong "bounce": ltr sweep 0..length-1, then rtl sweep length-2..1.
// Head pauses for a single frame at each edge; the next frame bounces back.
// When concatenated, edge cells (0 and length-1) are visited exactly once
// per direction reversal, producing the perceived bounce.
function buildBounce(length: number): Frame[] {
	const seq: Frame[] = [];
	for (let i = 0; i < length; i++) seq.push([i, -1]);
	for (let i = length - 2; i >= 1; i--) seq.push([i, 1]);
	return seq;
}

function buildSlideIn(tailLength: number): Frame[] {
	const seq: Frame[] = [];
	for (let i = -tailLength; i < 0; i++) seq.push([i, -1]);
	return seq;
}

function buildSlideOff(tailLength: number): Frame[] {
	const seq: Frame[] = [];
	for (let i = 0; i >= -tailLength; i--) seq.push([i, 1]);
	return seq;
}

function buildOneWay(length: number, tailLength: number, dir: number): Frame[] {
	// Single sweep with slide-in and slide-off, used for ltr/rtl directions.
	const seq: Frame[] = [];
	if (dir === -1) {
		for (let i = -tailLength; i < length + tailLength; i++)
			seq.push([i, dir]);
	} else {
		for (let i = length - 1 + tailLength; i >= -tailLength; i--)
			seq.push([i, dir]);
	}
	return seq;
}

/**
 * Creates a Knight Rider-style scanner animation over a set of DOM elements.
 *
 * See {@link KittConfig} for all options.
 *
 * @example
 * ```ts
 * const scanner = kitt({ target: "#logo", itemSelector: "path" });
 * scanner.play();
 * ```
 */
export function kitt(config: KittConfig): KittHandle {
	const {
		target,
		itemSelector,
		interval = 70,
		property = "color",
		baseValue = "inherit",
		trail = DEFAULT_TRAIL,
		direction = "pingpong",
		cycles = 1,
		autoStart = false,
		schedule,
		triggers = [],
		respectReducedMotion = true,
		onStart,
		onEnd,
		onTick,
	} = config;

	if (!trail.length)
		throw new Error("kitt: `trail` must contain at least one value");

	const tailLength = config.tailLength ?? Math.max(1, trail.length - 1);
	const els = resolveElements(target, itemSelector);
	const container = resolveContainer(target);
	const prev: string[] = new Array(els.length).fill(baseValue);

	// Build the three sequence pieces once. `loopBody` is what repeats; `intro`
	// and `outro` are played once per `play()` to slide the glow on/off the edges.
	let intro: Frame[];
	let loopBody: Frame[];
	let outro: Frame[];
	if (direction === "pingpong") {
		intro = buildSlideIn(tailLength);
		loopBody = buildBounce(els.length);
		outro = buildSlideOff(tailLength);
	} else {
		// Single-direction sweeps already include their own slide-in and slide-off,
		// so the whole sweep IS the loop body. No separate intro/outro needed.
		intro = [];
		loopBody = buildOneWay(
			els.length,
			tailLength,
			direction === "ltr" ? -1 : 1,
		);
		outro = [];
	}

	let sequence: Frame[] = [];
	let seqIdx = 0;
	let infiniteLoop = false;

	const ticker = createTickerRAF(interval);

	const resetAll = () => {
		for (let i = 0; i < els.length; i++) {
			if (prev[i] !== baseValue) {
				setStyle(els[i], property, baseValue);
				prev[i] = baseValue;
			}
		}
	};

	const renderFrame = (idx: number) => {
		for (let i = 0; i < els.length; i++) {
			const distance = Math.abs(i - idx);
			let value = baseValue;
			if (distance <= tailLength) {
				value = trail[Math.min(distance, trail.length - 1)];
			}
			if (prev[i] !== value) {
				setStyle(els[i], property, value);
				prev[i] = value;
			}
		}
	};

	const tickHandler = (t: number) => {
		if (!t) return;
		if (seqIdx >= sequence.length) {
			if (infiniteLoop) {
				sequence = loopBody.slice();
				seqIdx = 0;
			} else {
				ticker.stop();
				resetAll();
				onEnd?.();
				return;
			}
		}
		const [idx, dir] = sequence[seqIdx++];
		renderFrame(idx);
		onTick?.(idx, dir === -1 ? "ltr" : "rtl");
	};

	ticker.subscribe(tickHandler);

	const play = () => {
		if (respectReducedMotion && prefersReducedMotion()) return;
		if (ticker.isStarted()) return;
		if (els.length === 0) return;

		if (Number.isFinite(cycles)) {
			sequence = [...intro];
			for (let c = 0; c < cycles; c++) sequence.push(...loopBody);
			sequence.push(...outro);
			infiniteLoop = false;
		} else {
			// First iteration: intro + loop body. Subsequent iterations: loop body only.
			sequence = [...intro, ...loopBody];
			infiniteLoop = true;
		}
		seqIdx = 0;
		onStart?.();
		ticker.start();
	};

	const stop = () => {
		sequence = [];
		seqIdx = 0;
		ticker.stop();
		resetAll();
	};

	const toggle = () => {
		if (ticker.isStarted()) stop();
		else play();
	};

	const isPlaying = () => ticker.isStarted();

	let scheduleTimer: ReturnType<typeof setTimeout> | undefined;

	const clearScheduleTimer = () => {
		if (scheduleTimer !== undefined) {
			clearTimeout(scheduleTimer);
			scheduleTimer = undefined;
		}
	};

	const nextScheduleDelay = (cfg: KittScheduleConfig): number => {
		const iv = cfg.interval ?? [5000, 10000];
		if (typeof iv === "number") return iv;
		return randomInt(iv[0], iv[1]);
	};

	const scheduleNext = (cfg: KittScheduleConfig, delay: number) => {
		scheduleTimer = setTimeout(() => {
			play();
			if (cfg.repeat !== false) scheduleNext(cfg, nextScheduleDelay(cfg));
		}, delay);
	};

	const triggerCleanups: Array<() => void> = [];
	for (const trig of triggers) {
		if (!container) break;
		if (trig === "hover") {
			const handler = () => play();
			container.addEventListener("mouseenter", handler);
			triggerCleanups.push(() =>
				container.removeEventListener("mouseenter", handler),
			);
		} else if (trig === "click") {
			const handler = () => play();
			container.addEventListener("click", handler);
			triggerCleanups.push(() =>
				container.removeEventListener("click", handler),
			);
		} else if (trig === "visible") {
			const IO = (
				globalThis as {
					IntersectionObserver?: typeof IntersectionObserver;
				}
			).IntersectionObserver;
			if (!IO) continue;
			const observer = new IO((entries) => {
				for (const e of entries) if (e.isIntersecting) play();
			});
			observer.observe(container);
			triggerCleanups.push(() => observer.disconnect());
		}
	}

	if (schedule) {
		const initialDelay = schedule.initialDelay ?? 3000;
		scheduleNext(schedule, initialDelay);
	}

	if (autoStart) {
		queueMicrotask(() => play());
	}

	const destroy = () => {
		stop();
		clearScheduleTimer();
		for (const cleanup of triggerCleanups) cleanup();
		triggerCleanups.length = 0;
	};

	return { play, stop, toggle, isPlaying, destroy };
}
