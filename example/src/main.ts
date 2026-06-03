/**
 * @marianmeres/kitt — example app, written in the @marianmeres/vanilla idiom.
 *
 * Conventions on display (see vanilla's DESIGN.md):
 *   - HTML lives in HTML. Every bit of markup is a `<template>` in index.html;
 *     this module never builds DOM from strings — it clones via `fromTemplate`.
 *   - Components are factories returning views. `createDemoCard` is one reusable
 *     component; the gallery is data-driven (`DEMOS.map(... mount ...)`).
 *   - Everything cleans up. Each card ties the kitt scanner's `destroy()` into
 *     the view's `track()`, so tearing a view down stops its timers + listeners.
 *   - Explicit reactivity. The click demo feeds kitt's `onTick` into an
 *     `observable`; the readout `subscribe`s to it. The theme toggle is an
 *     `observable` driving the `:root.dark` class.
 *
 * Styling is the @marianmeres/design-tokens approach: every color is a semantic
 * `--app-color-*` custom property (see example/theme.css, generated from
 * example/src/theme.ts). Trails are built from those tokens, so a theme switch
 * recolors even a running scanner for free — the CSS variables just re-resolve.
 *
 * The bundle (example/dist/bundle.js) is produced by `deno task example:build`.
 */
import {
	createView,
	delegate,
	fromTemplate,
	mount,
	observable,
	refs,
	type ViewInstance,
} from "@marianmeres/vanilla";
import { kitt, type KittConfig } from "../../src/mod.ts";

/* ---------------------------------------------------------------------------
 * Theme-aware trails.
 *
 * `trail[0]` is the bright head; later entries dim toward the page background.
 * Because each value references a `--app-color-*` token via `var()`, the head
 * and its tail follow the active light/dark theme automatically.
 * ------------------------------------------------------------------------- */
function gradient(token: string, steps = 5): string[] {
	return Array.from({ length: steps }, (_, i) => {
		const pct = Math.round(100 - (i * 88) / (steps - 1)); // 100 → 12
		return `color-mix(in srgb, var(${token}) ${pct}%, var(--app-color-background))`;
	});
}

/* ---------------------------------------------------------------------------
 * The gallery data. One descriptor per demo card; `config` is the kitt options
 * minus `target` / `itemSelector` (those are wired by the card from the cloned
 * stage element). Every knob below — property, direction, cycles, interval,
 * triggers, schedule, trail — is plain kitt configuration.
 * ------------------------------------------------------------------------- */
interface Demo {
	id: string;
	title: string;
	/** Trusted HTML (our own copy) — bound via `html:` (innerHTML). */
	hint: string;
	/** `<template>` id for the elements the scanner animates. */
	stage: string;
	itemSelector: string;
	config: Partial<KittConfig>;
	/** Hide the Play/Stop buttons (default: shown). */
	noControls?: boolean;
	/** Wire `onTick` → a reactive head readout (default: off). */
	readout?: boolean;
}

const DEMOS: Demo[] = [
	{
		id: "basic",
		title: "1. Basic — color on text spans",
		hint: `Default config: <code>property: "color"</code>, pingpong once.`,
		stage: "tpl-stage-knight",
		itemSelector: "span",
		config: { trail: gradient("--app-color-primary") },
	},
	{
		id: "svg",
		title: "2. SVG fill — hover + auto-schedule",
		hint: `Hover the logo to play. Also auto-plays every 4–7&nbsp;s. ` +
			`<code>property: "fill"</code>.`,
		stage: "tpl-stage-logo",
		itemSelector: "rect",
		config: {
			property: "fill",
			baseValue: "currentColor",
			trail: gradient("--app-color-primary"),
			triggers: ["hover"],
			schedule: { initialDelay: 1500, interval: [4000, 7000], repeat: true },
		},
	},
	{
		id: "cyan",
		title: "3. Background — accent trail, LTR only",
		hint: `<code>property: "backgroundColor"</code>, ` +
			`<code>direction: "ltr"</code>, accent (cyan) trail.`,
		stage: "tpl-stage-boxes",
		itemSelector: ".cell",
		config: {
			property: "backgroundColor",
			baseValue: "var(--app-color-muted)",
			direction: "ltr",
			trail: gradient("--app-color-accent"),
		},
	},
	{
		id: "dots",
		title: "4. Opacity — infinite loop",
		hint: `<code>property: "opacity"</code>, numeric trail values, ` +
			`<code>cycles: Infinity</code>.`,
		stage: "tpl-stage-dots",
		itemSelector: ".dot",
		config: {
			property: "opacity",
			baseValue: "0.1",
			trail: ["1", "0.8", "0.6", "0.4", "0.2"],
			cycles: Infinity,
			interval: 90,
		},
	},
	{
		id: "bars",
		title: "5. Equalizer bars — RTL, 3 cycles",
		hint: `<code>direction: "rtl"</code>, <code>cycles: 3</code>, ` +
			`<code>interval: 40</code>, success (green) trail.`,
		stage: "tpl-stage-bars",
		itemSelector: ".bar",
		config: {
			property: "backgroundColor",
			baseValue: "var(--app-color-muted)",
			direction: "rtl",
			cycles: 3,
			interval: 40,
			trail: gradient("--app-color-success"),
		},
	},
	{
		id: "svgWave",
		title: "7. SVG opacity — pulsing circles",
		hint: `<code>property: "opacity"</code> on SVG <code>&lt;circle&gt;</code> ` +
			`elements, <code>cycles: Infinity</code>.`,
		stage: "tpl-stage-wave",
		itemSelector: "circle",
		config: {
			property: "opacity",
			baseValue: "0.1",
			trail: ["1", "0.8", "0.6", "0.4", "0.2"],
			cycles: Infinity,
			interval: 80,
		},
	},
	{
		id: "click",
		title: "6. Click trigger + onTick callback",
		hint: `Click the word to play. The current head index is shown below.`,
		stage: "tpl-stage-click",
		itemSelector: "span",
		noControls: true,
		readout: true,
		config: {
			triggers: ["click"],
			trail: gradient("--app-color-warning"),
		},
	},
];

/* ---------------------------------------------------------------------------
 * The card component: a factory taking `{ demo }` and returning a view.
 * ------------------------------------------------------------------------- */
function createDemoCard({ demo }: { demo: Demo }): ViewInstance {
	return createView((track) => {
		const el = fromTemplate("tpl-card");
		const r = refs(el);

		// Card chrome: one-directional data → DOM. `hint` is our own trusted
		// markup, so it goes through the `html:` (innerHTML) binding.
		(r.title as HTMLElement).textContent = demo.title;
		(r.hint as HTMLElement).innerHTML = demo.hint;

		// The elements the scanner animates, cloned from this demo's stage template.
		const stage = fromTemplate(demo.stage);
		r.stage.appendChild(stage);

		// A reactive head readout, fed by kitt's onTick (click demo only).
		const head = observable("head: —");

		// THE scanner. Target the cloned `stage` element (never a global
		// selector) so duplicated demos can't collide. kitt owns the ticker,
		// trigger listeners and any schedule timer; tying its destroy() into the
		// view's track() means destroy() stops all of it.
		const scanner = kitt({
			target: stage,
			itemSelector: demo.itemSelector,
			onTick: demo.readout
				? (idx, phase) => head.set(`head: ${idx} (${phase})`)
				: undefined,
			onEnd: demo.readout ? () => head.set("head: —") : undefined,
			...demo.config,
		});
		track(scanner.destroy);

		// Play / Stop, delegated off the card root (one listener per event type).
		track(
			delegate(el, {
				play: () => scanner.play(),
				stop: () => scanner.stop(),
			}),
		);

		if (demo.noControls) r.controls.remove();

		if (demo.readout) {
			track(head.subscribe((txt) => (r.readout.textContent = txt)));
		} else {
			r.readout.remove();
		}

		return { el };
	});
}

/* ---------------------------------------------------------------------------
 * Compose: one root view holds the grid and mounts a card per demo. mount()
 * appends each child AND tracks its destroy(), so the root's destroy() tears
 * the whole gallery (and every scanner) down.
 * ------------------------------------------------------------------------- */
const app = createView((track) => {
	// The cloned template root IS the grid container, so cards mount into `el`
	// directly. (refs() only collects descendants, never the root itself.)
	const el = fromTemplate("tpl-grid");
	for (const demo of DEMOS) mount(track, el, createDemoCard, { demo });
	return { el };
});

document.getElementById("app")!.appendChild(app.el!);

/* ---------------------------------------------------------------------------
 * Global theme — module-level and page-lifetime, so it is intentionally NOT
 * tracked by any view (it never needs teardown). Flipping it toggles the
 * `:root.dark` class design-tokens keys off; the running scanners recolor for
 * free because their trails resolve `--app-color-*` live.
 * ------------------------------------------------------------------------- */
const theme = observable<"light" | "dark">(
	document.documentElement.classList.contains("dark") ? "dark" : "light",
);

const toggle = document.getElementById("theme-toggle");
theme.subscribe((t) => {
	document.documentElement.classList.toggle("dark", t === "dark");
	if (toggle) toggle.textContent = t === "dark" ? "☀ light mode" : "☾ dark mode";
});
toggle?.addEventListener(
	"click",
	() => theme.update((t) => (t === "light" ? "dark" : "light")),
);

// expose for console poking
Object.assign(globalThis, { app, theme });
