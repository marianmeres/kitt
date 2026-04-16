import { assertEquals, assertExists, assertThrows } from "@std/assert";
import { kitt } from "../src/kitt.ts";

// Minimal DOM stubs — enough to let `kitt()` resolve targets and write styles
// without pulling in a full DOM shim. These cover the non-browser code path.

class FakeElement {
	style: Record<string, string> = {};
	children: FakeElement[] = [];
	listeners: Record<string, ((e: unknown) => void)[]> = {};
	constructor(public tagName = "SPAN") {}
	querySelectorAll(_: string): FakeElement[] {
		return this.children;
	}
	addEventListener(ev: string, cb: (e: unknown) => void) {
		(this.listeners[ev] ??= []).push(cb);
	}
	removeEventListener(ev: string, cb: (e: unknown) => void) {
		this.listeners[ev] = (this.listeners[ev] ?? []).filter((x) => x !== cb);
	}
}

function makeEls(n: number): FakeElement[] {
	return Array.from({ length: n }, () => new FakeElement());
}

Deno.test("kitt: returns handle with expected API", () => {
	const els = makeEls(5);
	const handle = kitt({ target: els as unknown as ArrayLike<Element> });
	assertExists(handle.play);
	assertExists(handle.stop);
	assertExists(handle.toggle);
	assertExists(handle.isPlaying);
	assertExists(handle.destroy);
	assertEquals(handle.isPlaying(), false);
	handle.destroy();
});

Deno.test("kitt: throws on empty trail", () => {
	const els = makeEls(3);
	assertThrows(
		() =>
			kitt({
				target: els as unknown as ArrayLike<Element>,
				trail: [],
			}),
		Error,
		"trail",
	);
});

Deno.test("kitt: play is a no-op when elements list is empty", () => {
	const handle = kitt({ target: [] as unknown as ArrayLike<Element> });
	handle.play();
	assertEquals(handle.isPlaying(), false);
	handle.destroy();
});

Deno.test("kitt: stop resets touched elements to baseValue", async () => {
	const els = makeEls(5);
	// Pre-dirty each element so we can observe the reset unambiguously.
	for (const el of els) el.style.color = "red";
	const handle = kitt({
		target: els as unknown as ArrayLike<Element>,
		interval: 10,
		baseValue: "inherit",
	});
	handle.play();
	await new Promise((r) => setTimeout(r, 200));
	handle.stop();
	for (const el of els) {
		assertEquals(el.style.color, "inherit");
	}
	handle.destroy();
});

Deno.test("kitt: destroy is idempotent", () => {
	const els = makeEls(3);
	const handle = kitt({ target: els as unknown as ArrayLike<Element> });
	handle.destroy();
	handle.destroy();
});
