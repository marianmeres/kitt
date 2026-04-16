# AGENTS.md — Machine-Readable Package Documentation

## Package Identity

- **Name:** `@marianmeres/kitt`
- **License:** MIT
- **Repository:** https://github.com/marianmeres/kitt
- **NPM:** https://www.npmjs.com/package/@marianmeres/kitt
- **JSR:** https://jsr.io/@marianmeres/kitt

## Purpose

Knight Rider-style scanner animation factory. Sweeps a bright "head" with a
trailing gradient across any DOM element collection, writing a configurable CSS
property frame-by-frame.

## Core Concepts

### Animation Model

1. Resolve `target` (+ optional `itemSelector`) into an array of `HTMLElement`s.
2. Pre-build a frame `sequence` of `[headIndex, direction]` tuples consisting
   of `intro + (loopBody × cycles) + outro`. For finite cycles the full
   sequence is built up-front; for `cycles: Infinity` the loop body is
   re-spliced after the intro.
3. Each tick advances `seqIdx`, computes `distance = |i - headIndex|` per
   element, and writes `trail[Math.min(distance, trail.length-1)]` (or
   `baseValue` if outside `tailLength`) — diffed against the previous value to
   avoid redundant style writes.

### Direction Handling

| Direction   | intro              | loopBody                          | outro              |
| ----------- | ------------------ | --------------------------------- | ------------------ |
| `pingpong`  | slide-in           | bounce (0..N-1, then N-2..1)      | slide-off          |
| `ltr`       | _empty_            | full sweep with built-in slides   | _empty_            |
| `rtl`       | _empty_            | full sweep with built-in slides   | _empty_            |

For pingpong, edges (0 and N-1) are visited exactly once per direction reversal.

### Tick Source

Uses `createTickerRAF` from `@marianmeres/ticker`. The first tick value `0` is
ignored (sentinel for stopped state).

### Reduced Motion

`prefers-reduced-motion: reduce` short-circuits `play()` when
`respectReducedMotion: true` (default). Schedules and triggers still invoke
`play()`, but it no-ops.

## File Structure

```
src/
├── mod.ts           # Re-exports public API from kitt.ts
└── kitt.ts          # Sole module: factory, types, internal helpers
tests/
└── kitt.test.ts     # FakeElement-based tests (no DOM shim)
example/
├── index.html       # Runnable demo gallery
└── dist/bundle.js   # Built example (deno task example:build)
scripts/
└── build-npm.ts     # NPM build via @marianmeres/npmbuild
```

## Public API

### Function

| Function       | Returns      | Description                                  |
| -------------- | ------------ | -------------------------------------------- |
| `kitt(config)` | `KittHandle` | Build and return a scanner animation handle. |

### Types

```typescript
type KittTarget = string | Element | NodeList | ArrayLike<Element>;
type KittDirection = "ltr" | "rtl" | "pingpong";
type KittTrigger = "hover" | "click" | "visible";

interface KittScheduleConfig {
    initialDelay?: number;          // default 3000
    interval?: number | [number, number]; // default [5000, 10000]
    repeat?: boolean;               // default true
}

interface KittConfig {
    target: KittTarget;
    itemSelector?: string;
    interval?: number;              // default 70 (ms)
    tailLength?: number;            // default max(1, trail.length-1)
    property?: string;              // default "color"
    baseValue?: string;             // default "inherit"
    trail?: string[];               // default red KITT gradient
    direction?: KittDirection;      // default "pingpong"
    cycles?: number;                // default 1; Infinity = loop
    autoStart?: boolean;            // default false
    schedule?: KittScheduleConfig | false;
    triggers?: KittTrigger[];       // default []
    respectReducedMotion?: boolean; // default true
    onStart?: () => void;
    onEnd?: () => void;             // not fired on stop()
    onTick?: (headIndex: number, phase: "ltr" | "rtl") => void;
}

interface KittHandle {
    play(): void;
    stop(): void;
    toggle(): void;
    isPlaying(): boolean;
    destroy(): void;                // idempotent
}
```

### Defaults

| Field            | Default                                                                  |
| ---------------- | ------------------------------------------------------------------------ |
| `interval`       | `70`                                                                     |
| `property`       | `"color"`                                                                |
| `baseValue`      | `"inherit"`                                                              |
| `trail`          | `["rgb(255,0,0)", "rgb(153,0,0)", "rgb(51,0,0)"]`                        |
| `direction`      | `"pingpong"`                                                             |
| `cycles`         | `1`                                                                      |
| `tailLength`     | `Math.max(1, trail.length - 1)`                                          |
| `schedule`       | _disabled_                                                               |
| `triggers`       | `[]`                                                                     |
| `reducedMotion`  | `true` (honoured)                                                        |

## Target Resolution

| `target` shape       | `itemSelector` | items                                     | container (for triggers) |
| -------------------- | -------------- | ----------------------------------------- | ------------------------ |
| `string`             | unset          | `document.querySelectorAll(target)`       | `document.querySelector(target)` |
| `string`             | set            | `container.querySelectorAll(itemSelector)` | `document.querySelector(target)` |
| `Element`            | unset          | `target.children`                         | `target`                 |
| `Element`            | set            | `target.querySelectorAll(itemSelector)`   | `target`                 |
| `NodeList` / `Array` | (ignored)      | `Array.from(target)`                      | `null` → triggers skipped |

## Style Writes

`setStyle(el, property, value)` chooses between:

- `el.style.setProperty(property, value)` when `property` contains `-`
  (kebab-case, including custom properties like `--my-var`)
- `el.style[property] = value` otherwise (camelCase like `backgroundColor`)

Each frame, each element's value is compared with the previous-frame value
stored in the `prev[]` array; only changed cells are written.

## Triggers

| Trigger     | Mechanism                                                          | Skipped when                                |
| ----------- | ------------------------------------------------------------------ | ------------------------------------------- |
| `"hover"`   | `container.addEventListener("mouseenter", play)`                   | no container resolved                       |
| `"click"`   | `container.addEventListener("click", play)`                        | no container resolved                       |
| `"visible"` | `new IntersectionObserver(...).observe(container)` → calls `play()` | no `IntersectionObserver` global, or no container |

All listeners are detached by `destroy()`.

## Schedule

If `schedule` is set:

1. After `initialDelay`, call `play()`.
2. If `repeat !== false`, schedule the next call after a delay computed from
   `interval` (fixed or `randomInt(min, max)` if a tuple).
3. `destroy()` clears the pending `setTimeout`.

The schedule is independent of the actual run completion; it does not wait for
`onEnd`.

## Runtime Constraints

- `trail` must be non-empty (throws `Error` at construction).
- `play()` is a no-op if: ticker already started, items empty, or reduced-motion
  active (when respected).
- `interval` below ~16.67 ms causes a console warning from the RAF ticker.
- SSR-safe: with no `document` / `Element` global, items resolve to `[]` and
  `play()` does nothing.

## Dependencies

- Runtime: `@marianmeres/ticker` (JSR: `jsr:@marianmeres/ticker@^1.16.5`)
- Dev/Test: `@std/assert`, `@std/fs`, `@std/path`

## Platform Support

- **Deno**: native.
- **Node.js**: via npm package built with `@marianmeres/npmbuild`.
- **Browser**: full support including `IntersectionObserver` triggers.
- **SSR**: importable; resolves zero items without a DOM.

## Tasks

```bash
deno task test           # Run tests
deno task test:watch     # Tests in watch mode
deno task example:watch  # Build the example with watch
deno task npm:build      # Build the npm artifact into .npm-dist/
deno task npm:publish    # Build + npm publish
deno task release        # Bump version (jsr:@marianmeres/deno-release)
deno task publish        # deno publish + npm publish
deno task rp             # release patch + publish
deno task rpm            # release minor + publish
```

## Common Patterns

### Default sweep

```typescript
kitt({ target: "#word", itemSelector: "span" }).play();
```

### Background colour, infinite, hover-triggered

```typescript
kitt({
    target: "#bars",
    itemSelector: ".bar",
    property: "backgroundColor",
    baseValue: "#222",
    trail: ["#0ff", "#0cc", "#099", "#066", "#033"],
    cycles: Infinity,
    triggers: ["hover"],
});
```

### SVG fill on a logo, scheduled

```typescript
kitt({
    target: "#svg-logo",
    itemSelector: "rect",
    property: "fill",
    baseValue: "currentColor",
    schedule: { initialDelay: 1500, interval: [4000, 7000] },
});
```

### Direct NodeList target

```typescript
kitt({
    target: document.querySelectorAll(".cell"),
    property: "opacity",
    baseValue: "0.1",
    trail: ["1", "0.7", "0.4", "0.2"],
});
```

### Tick callback (e.g. drive an external readout)

```typescript
kitt({
    target: "#word",
    itemSelector: "span",
    onTick: (idx, phase) => readout.textContent = `${idx} (${phase})`,
});
```

## Anti-Patterns

| Don't                                                | Do                                                          |
| ---------------------------------------------------- | ----------------------------------------------------------- |
| Forget `destroy()` when using `schedule`/`triggers`. | Always destroy on unmount.                                  |
| Pass `trail: []`.                                    | Provide at least one value, or omit to use the default.     |
| Set `interval` below 16 ms expecting precision.      | Use `interval >= 16`; or accept the RAF ceiling.            |
| Use a `NodeList` target and expect triggers to fire. | Use a container `Element` / selector + `itemSelector`.      |
| Mutate config after construction.                    | Build a new instance instead; the factory snapshots config. |

## Testing Notes

- Tests use a minimal `FakeElement` shim (`tests/kitt.test.ts`) — they cover
  the non-browser path: handle shape, throw on empty trail, no-op on empty
  list, reset on `stop()`, idempotent `destroy()`.
- No JSDOM / happy-dom dependency.

## Publishing

JSR strict-mode requirements satisfied:

- All public symbols have JSDoc.
- All exported types use explicit type annotations (no inference on public API).
- `deno doc --lint src/mod.ts` passes.
- `deno publish --dry-run` passes.

## See Also

- [README.md](./README.md) — human-friendly overview.
- [API.md](./API.md) — full API reference.
- [example/index.html](./example/index.html) — runnable demos.
