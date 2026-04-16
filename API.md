# API Reference

Complete API documentation for `@marianmeres/kitt`.

## Table of Contents

- [Functions](#functions)
  - [kitt](#kittconfig-kitthandle)
- [Interfaces](#interfaces)
  - [KittConfig](#kittconfig)
  - [KittHandle](#kitthandle)
  - [KittScheduleConfig](#kittscheduleconfig)
- [Types](#types)
  - [KittTarget](#kitttarget)
  - [KittDirection](#kittdirection)
  - [KittTrigger](#kittttrigger)

---

## Functions

### `kitt(config): KittHandle`

Creates a Knight Rider-style scanner animation over a set of DOM elements. The
returned handle drives the animation imperatively.

The animation walks a "head" position across the resolved element list. Each
element within `tailLength` of the head receives a value from `trail` written to
the configured CSS `property`; elements outside the trail get `baseValue`.

**Parameters:**

| Parameter | Type                          | Required | Description                       |
| --------- | ----------------------------- | -------- | --------------------------------- |
| `config`  | [`KittConfig`](#kittconfig)   | yes      | Configuration object (see below). |

**Returns:** [`KittHandle`](#kitthandle)

**Throws:** `Error` if `trail` is an empty array.

**Examples:**

```typescript
import { kitt } from "@marianmeres/kitt";

// 1. Default: pingpong sweep, color property, runs once.
const a = kitt({ target: "#logo", itemSelector: "span" });
a.play();

// 2. Background color sweep, infinite, on hover.
const b = kitt({
    target: "#bars",
    itemSelector: ".bar",
    property: "backgroundColor",
    baseValue: "#222",
    trail: ["#0ff", "#0cc", "#099", "#066", "#033"],
    cycles: Infinity,
    triggers: ["hover"],
});

// 3. Auto-scheduled replay on an SVG.
const c = kitt({
    target: "#svg-logo",
    itemSelector: "rect",
    property: "fill",
    schedule: { initialDelay: 1500, interval: [4000, 7000] },
});

// 4. Cleanup
b.destroy();
c.destroy();
```

---

## Interfaces

### `KittConfig`

Configuration passed to `kitt()`. Only `target` is required.

```typescript
interface KittConfig {
    target: KittTarget;
    itemSelector?: string;
    interval?: number;
    tailLength?: number;
    property?: string;
    baseValue?: string;
    trail?: string[];
    direction?: KittDirection;
    cycles?: number;
    autoStart?: boolean;
    schedule?: KittScheduleConfig | false;
    triggers?: KittTrigger[];
    respectReducedMotion?: boolean;
    onStart?: () => void;
    onEnd?: () => void;
    onTick?: (headIndex: number, phase: "ltr" | "rtl") => void;
}
```

**Fields:**

| Field                  | Type                            | Default                       | Description                                                                                                          |
| ---------------------- | ------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `target`               | [`KittTarget`](#kitttarget)     | —                             | Selector, `Element`, `NodeList`, or array of elements. See [Target resolution](#target-resolution).                  |
| `itemSelector`         | `string`                        | —                             | When `target` resolves to a container, select children matching this selector.                                       |
| `interval`             | `number`                        | `70`                          | Tick interval in ms (passed to `createTickerRAF`). Below ~16.67 ms the RAF ticker emits a console warning.            |
| `tailLength`           | `number`                        | `Math.max(1, trail.length-1)` | Number of elements behind/ahead of the head that receive a trail color.                                              |
| `property`             | `string`                        | `"color"`                     | CSS property to write. Kebab-case names use `setProperty`; camelCase writes via `element.style[prop]`.               |
| `baseValue`            | `string`                        | `"inherit"`                   | Value written to "off" elements (and used to reset on `stop()`).                                                     |
| `trail`                | `string[]`                      | red KITT-style gradient       | Values for the scanner gradient. `trail[0]` is the head (brightest); subsequent entries dim progressively.            |
| `direction`            | [`KittDirection`](#kittdirection) | `"pingpong"`                  | Sweep direction.                                                                                                     |
| `cycles`               | `number`                        | `1`                           | Full passes per `play()`. Use `Infinity` to loop until `stop()` / `destroy()`.                                       |
| `autoStart`            | `boolean`                       | `false`                       | Call `play()` immediately on creation (in a microtask).                                                              |
| `schedule`             | [`KittScheduleConfig`](#kittscheduleconfig) \| `false` | —      | Auto-replay schedule. Omit or pass `false` to disable.                                                               |
| `triggers`             | [`KittTrigger[]`](#kittttrigger) | `[]`                          | DOM event triggers wired on the resolved container.                                                                  |
| `respectReducedMotion` | `boolean`                       | `true`                        | When `true`, `play()` is a no-op if `prefers-reduced-motion: reduce` matches.                                        |
| `onStart`              | `() => void`                    | —                             | Called when a `play()` run begins.                                                                                   |
| `onEnd`                | `() => void`                    | —                             | Called when a run completes naturally (not after `stop()`).                                                          |
| `onTick`               | `(idx, phase) => void`          | —                             | Called on each tick with the head index and current sweep phase (`"ltr"` for left-to-right, `"rtl"` for right-to-left). |

#### Target resolution

| `target` shape       | `itemSelector`        | Resolved items                                       | Container (used by triggers)         |
| -------------------- | --------------------- | ---------------------------------------------------- | ------------------------------------ |
| `string`             | _unset_               | `document.querySelectorAll(target)`                  | `document.querySelector(target)`     |
| `string`             | _set_                 | container's `querySelectorAll(itemSelector)`         | `document.querySelector(target)`     |
| `Element`            | _unset_               | `target.children`                                    | `target`                             |
| `Element`            | _set_                 | `target.querySelectorAll(itemSelector)`              | `target`                             |
| `NodeList` / `Array` | (ignored)             | `Array.from(target)`                                 | `null` (triggers are skipped)        |

If no items resolve, `play()` is a no-op.

---

### `KittHandle`

Imperative handle returned by `kitt()`.

```typescript
interface KittHandle {
    play(): void;
    stop(): void;
    toggle(): void;
    isPlaying(): boolean;
    destroy(): void;
}
```

**Methods:**

| Method        | Description                                                                                                       |
| ------------- | ----------------------------------------------------------------------------------------------------------------- |
| `play()`      | Start a run. No-op if already playing, if reduced motion is active and `respectReducedMotion` is on, or if items are empty. Fires `onStart` (if provided). |
| `stop()`      | Stop immediately, reset all touched elements to `baseValue`. Does **not** fire `onEnd`.                           |
| `toggle()`    | Calls `stop()` if playing, `play()` otherwise.                                                                    |
| `isPlaying()` | Returns whether the underlying ticker is currently running.                                                       |
| `destroy()`   | Calls `stop()`, clears any pending scheduled replay, and detaches all trigger listeners. Idempotent.              |

---

### `KittScheduleConfig`

Optional auto-replay scheduling.

```typescript
interface KittScheduleConfig {
    initialDelay?: number;
    interval?: number | [number, number];
    repeat?: boolean;
}
```

| Field          | Type                       | Default          | Description                                                                            |
| -------------- | -------------------------- | ---------------- | -------------------------------------------------------------------------------------- |
| `initialDelay` | `number`                   | `3000`           | Delay in ms before the first scheduled `play()`.                                       |
| `interval`     | `number \| [number,number]` | `[5000, 10000]`  | Fixed delay in ms, or `[min, max]` random delay (re-rolled each iteration).            |
| `repeat`       | `boolean`                  | `true`           | When `false`, the schedule fires only once after `initialDelay`.                       |

**Example:**

```typescript
kitt({
    target: "#logo",
    itemSelector: "rect",
    schedule: { initialDelay: 1000, interval: [3000, 6000], repeat: true },
});
```

---

## Types

### `KittTarget`

```typescript
type KittTarget = string | Element | NodeList | ArrayLike<Element>;
```

See [Target resolution](#target-resolution) for how each shape is interpreted.

---

### `KittDirection`

```typescript
type KittDirection = "ltr" | "rtl" | "pingpong";
```

| Value        | Description                                                     |
| ------------ | --------------------------------------------------------------- |
| `"ltr"`      | Single sweep left-to-right per cycle.                           |
| `"rtl"`      | Single sweep right-to-left per cycle.                           |
| `"pingpong"` | Bouncing sweep. Each cycle = one full ltr + return rtl.         |

For `"ltr"` and `"rtl"`, every cycle is a complete sweep with slide-in /
slide-off so the trail enters and exits cleanly. For `"pingpong"`, the slide-in
and slide-off are played once per `play()` and the loop body is the bounce.

---

### `KittTrigger`

```typescript
type KittTrigger = "hover" | "click" | "visible";
```

DOM event triggers wired on the resolved container element. If `target`
resolves to a list (NodeList / array), no container is available and triggers
are skipped.

| Value       | Wires                                                                       |
| ----------- | --------------------------------------------------------------------------- |
| `"hover"`   | `mouseenter` listener that calls `play()`.                                  |
| `"click"`   | `click` listener that calls `play()`.                                       |
| `"visible"` | `IntersectionObserver` that calls `play()` whenever the container intersects. Skipped silently in environments without `IntersectionObserver`. |

All trigger listeners are detached by `destroy()`.

---

## Behavior Notes

- **Reduced motion**: when `respectReducedMotion: true` (default), `play()`
  short-circuits if `matchMedia("(prefers-reduced-motion: reduce)").matches`.
  Schedules and triggers still call `play()`, but it does nothing in that case.
- **Style writes are diffed**: each tick only writes to elements whose value
  changed since the last frame, to minimize layout/style work.
- **Empty target**: `play()` is a no-op when no items resolve.
- **Empty trail**: throws `Error` at construction time.
- **NodeList target + triggers**: triggers require an `Element` container; with
  a `NodeList` / array `target`, they are silently skipped.
- **`destroy()`**: must be called when removing the target from the DOM if
  `schedule` or `triggers` were set, otherwise the timer / listeners leak.

---

## Dependencies

- Runtime: [`@marianmeres/ticker`](https://jsr.io/@marianmeres/ticker) — used
  via `createTickerRAF` for RAF-synced ticking.

## Platform Support

- **Browser**: full support.
- **Deno / Node SSR**: factory runs without throwing; DOM-resolved selectors
  return empty lists, so `play()` is a no-op. Useful for SSR-safe imports.
