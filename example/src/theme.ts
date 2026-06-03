/**
 * KITT example theme — a @marianmeres/design-tokens `ThemeSchema`.
 *
 * The dark palette reproduces the original example's hand-picked colors
 * (`#0b0b0e` page, `#141418` panel, `#26262c` border, `#d7d7dc` text, the KITT
 * red `#fc4a50`) — now expressed as semantic tokens instead of ad-hoc CSS vars.
 * A matching light palette is added so the page can toggle modes.
 *
 * `example/gen-theme.ts` turns this into `example/theme.css` (the `--app-color-*`
 * custom properties the page styles against). Regenerate with:
 *
 *     deno task example:theme
 */
import type { ThemeSchema } from "@marianmeres/design-tokens";

export const kittTheme: ThemeSchema = {
	// Light mode → `:root`
	light: {
		colors: {
			intent: {
				primary: { DEFAULT: "#e11d2b", foreground: "#ffffff" }, // KITT red
				accent: { DEFAULT: "#0891b2", foreground: "#ffffff" }, // scanner cyan
				destructive: { DEFAULT: "#dc2626", foreground: "#ffffff" },
				warning: { DEFAULT: "#b45309", foreground: "#ffffff" },
				success: { DEFAULT: "#059669", foreground: "#ffffff" },
			},
			role: {
				paired: {
					background: { DEFAULT: "#fafafa", foreground: "#18181b" },
					muted: { DEFAULT: "#e7e7ea", foreground: "#6b6b73" },
					surface: { DEFAULT: "#ffffff", foreground: "#18181b" }, // demo cards
					"surface-1": { DEFAULT: "#f4f4f5", foreground: "#18181b" },
				},
				single: {
					foreground: "#18181b",
					border: { DEFAULT: "#d4d4d8" },
					input: { DEFAULT: "#ffffff" },
					ring: "color-mix(in srgb, #e11d2b 30%, transparent)",
				},
			},
		},
	},
	// Dark mode → `:root.dark` (the original example's palette)
	dark: {
		colors: {
			intent: {
				primary: { DEFAULT: "#fc4a50", foreground: "#ffffff" }, // original --accent
				accent: { DEFAULT: "#22d3ee", foreground: "#06121a" },
				destructive: { DEFAULT: "#fb7185", foreground: "#1a0307" },
				warning: { DEFAULT: "#fbbf24", foreground: "#1a1200" },
				success: { DEFAULT: "#34d399", foreground: "#04140d" },
			},
			role: {
				paired: {
					background: { DEFAULT: "#0b0b0e", foreground: "#d7d7dc" }, // --bg / --fg
					muted: { DEFAULT: "#16161b", foreground: "#7a7a83" }, // --muted
					surface: { DEFAULT: "#141418", foreground: "#d7d7dc" }, // --panel
					"surface-1": { DEFAULT: "#1c1c22", foreground: "#d7d7dc" },
				},
				single: {
					foreground: "#d7d7dc",
					border: { DEFAULT: "#26262c" }, // --border
					input: { DEFAULT: "#141418" },
					ring: "color-mix(in srgb, #fc4a50 35%, transparent)",
				},
			},
		},
	},
};
