// Post-build helper for the example page.
//
// `deno task example:build` runs deno-build with `--hash`, which emits a
// content-hashed copy of the bundle (`bundle.<hash>.js`) plus a manifest. This
// script then rewrites the <script> tag in index.html to point at that hashed
// file, so the deployed page gets a cache-bustable URL.
//
//   deno run -A example/inject-bundle.ts            # point at the hashed bundle
//   deno run -A example/inject-bundle.ts --reset    # point at the stable bundle.js
//
// `--reset` is used by `example:watch`: dev rebuilds write the stable
// `dist/bundle.js`, so the page must reference that plain name to live-reload.

import { join } from "@std/path";

const EXAMPLE_DIR = new URL(".", import.meta.url).pathname;
const HTML = join(EXAMPLE_DIR, "index.html");
const MANIFEST = join(EXAMPLE_DIR, "dist", "bundle.js.manifest.json");

// Matches the current src whether it's the stable name or a previously
// injected hashed name, so re-running is idempotent.
const SRC_RE = /src="\.\/dist\/bundle(?:\.[0-9a-f]+)?\.js"/;

async function resolveBundleName(reset: boolean): Promise<string> {
	if (reset) return "bundle.js";
	const manifest = JSON.parse(await Deno.readTextFile(MANIFEST));
	const name = manifest["bundle.js"];
	if (typeof name !== "string") {
		throw new Error(`Missing "bundle.js" entry in ${MANIFEST}`);
	}
	return name;
}

const reset = Deno.args.includes("--reset");
const bundle = await resolveBundleName(reset);

const html = await Deno.readTextFile(HTML);
if (!SRC_RE.test(html)) {
	throw new Error(`Could not find the bundle <script> src in ${HTML}`);
}
const next = html.replace(SRC_RE, `src="./dist/${bundle}"`);

if (next !== html) {
	await Deno.writeTextFile(HTML, next);
}
console.error(`[inject-bundle] index.html -> ./dist/${bundle}`);
