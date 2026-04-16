# @marianmeres/kitt

[![NPM version](https://img.shields.io/npm/v/@marianmeres/kitt)](https://www.npmjs.com/package/@marianmeres/kitt)
[![JSR version](https://jsr.io/badges/@marianmeres/kitt)](https://jsr.io/@marianmeres/kitt)

Knight Rider-style scanner animation for any set of DOM elements.

A tiny factory that animates a bright "head" with a trailing gradient across any
element collection. Every aspect (selector, CSS property, colors, direction,
cycles, triggers, schedule) is configurable. Works with text spans, SVG nodes,
divs, images — anything you can select.

## Install

```shell
npm i @marianmeres/kitt
```

```shell
deno add jsr:@marianmeres/kitt
```

## Basic Usage

```typescript
import { kitt } from "@marianmeres/kitt";

// Sweep the `color` property across the spans inside #logo, once.
const scanner = kitt({
    target: "#logo",
    itemSelector: "span",
});

scanner.play();
```

The factory returns a [handle](#handle-api) with `play`, `stop`, `toggle`,
`isPlaying`, and `destroy` methods.

## Targeting Elements

`target` is flexible:

| Form           | Resolution                                                                |
| -------------- | ------------------------------------------------------------------------- |
| CSS selector   | `document.querySelector(target)`. With `itemSelector`, used as container. |
| `Element`      | Treated as container; items = `itemSelector` children or direct children. |
| `NodeList`     | Used directly as the items to animate.                                    |
| Array of nodes | Used directly as the items to animate.                                    |

```typescript
// Container + child selector
kitt({ target: "#logo", itemSelector: "rect" });

// Direct list
const els = document.querySelectorAll(".cell");
kitt({ target: els });
```

## Animating Any CSS Property

By default `kitt` writes to `color`, but any CSS property works — including
custom properties (kebab-case names use `setProperty`, camelCase write to
`element.style[prop]`).

```typescript
// Background color sweep
kitt({
    target: "#bars",
    itemSelector: ".bar",
    property: "backgroundColor",
    baseValue: "#222",
    trail: ["#0ff", "#0cc", "#099", "#066", "#033"],
});

// Opacity pulse
kitt({
    target: "#dots",
    itemSelector: ".dot",
    property: "opacity",
    baseValue: "0.1",
    trail: ["1", "0.8", "0.6", "0.4", "0.2"],
    cycles: Infinity,
});
```

## Direction & Cycles

```typescript
kitt({
    target: ".bars > div",
    direction: "rtl", // "ltr" | "rtl" | "pingpong" (default)
    cycles: 3, // Use `Infinity` to loop until stopped
    interval: 40, // Tick interval in ms (default 70)
});
```

## Auto-replay Schedule

```typescript
kitt({
    target: "#svg-logo",
    itemSelector: "rect",
    property: "fill",
    schedule: {
        initialDelay: 1500, // ms before first scheduled play (default 3000)
        interval: [4000, 7000], // fixed ms or [min, max] random range (default [5000, 10000])
        repeat: true, // re-schedule after each play (default true)
    },
});
```

## DOM Triggers

Wire `play()` to events on the resolved container:

```typescript
kitt({
    target: "#logo",
    itemSelector: "span",
    triggers: ["hover", "click", "visible"],
});
```

| Trigger   | Fires `play()` on                                                            |
| --------- | ---------------------------------------------------------------------------- |
| `hover`   | `mouseenter` on the container.                                               |
| `click`   | `click` on the container.                                                    |
| `visible` | `IntersectionObserver` reports the container intersecting (browser only).    |

## Reduced-Motion

By default `kitt` honours `prefers-reduced-motion: reduce` and silently skips
`play()` calls. Override with `respectReducedMotion: false`.

## Lifecycle Hooks

```typescript
kitt({
    target: ".x",
    onStart: () => console.log("starting"),
    onEnd: () => console.log("finished a run naturally"),
    onTick: (headIndex, phase) => console.log(headIndex, phase), // phase: "ltr" | "rtl"
});
```

## Handle API

`kitt(config)` returns:

| Method        | Description                                                          |
| ------------- | -------------------------------------------------------------------- |
| `play()`      | Start a run. No-op if already playing or reduced motion is active.   |
| `stop()`      | Stop immediately and reset all elements to `baseValue`.              |
| `toggle()`    | Play if stopped, stop if playing.                                    |
| `isPlaying()` | Returns `true` while a run is active.                                |
| `destroy()`   | Stop, clear scheduled replays, detach trigger listeners.             |

Always call `destroy()` when removing the target from the DOM, especially when
`schedule` or `triggers` were set.

## Examples

See [`example/index.html`](./example/index.html) for a runnable gallery
covering text spans, SVG `<rect>` / `<circle>`, background-color cells, opacity
dots, equalizer bars, hover/click triggers, and `onTick` readouts.

```shell
deno task example:watch
# then open example/index.html
```

---

## API Reference

See [API.md](./API.md) for full API documentation.

### Exports

| Export               | Kind     | Description                                             |
| -------------------- | -------- | ------------------------------------------------------- |
| `kitt`               | function | Factory; returns a [`KittHandle`](./API.md#kitthandle). |
| `KittConfig`         | type     | Configuration object passed to `kitt()`.                |
| `KittHandle`         | type     | Handle returned by `kitt()`.                            |
| `KittScheduleConfig` | type     | Auto-replay scheduling config.                          |
| `KittTarget`         | type     | Accepted target shapes.                                 |
| `KittDirection`      | type     | `"ltr" \| "rtl" \| "pingpong"`.                         |
| `KittTrigger`        | type     | `"hover" \| "click" \| "visible"`.                      |

## License

[MIT](LICENSE)
