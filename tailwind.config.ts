import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "var(--color-background)",
        surface: "var(--color-surface)",
        surface2: "var(--color-surface-2)",
        surfaceElevated: "var(--color-surface-elevated)",
        ink: {
          900: "var(--color-text-primary)",
          700: "var(--color-text-primary)",
          600: "var(--color-text-secondary)",
          500: "var(--color-text-tertiary)",
          400: "var(--color-text-tertiary)",
        },
        line: "var(--color-border)",
        // "signal" / "reference" are the original analytics-era accent
        // names (still used by charts and older components). They now
        // resolve to the same violet/coral tokens as "primary"/"coral"
        // so both naming schemes stay in sync across themes.
        signal: {
          DEFAULT: "var(--color-primary)",
          soft: "var(--color-primary-soft)",
        },
        reference: {
          DEFAULT: "var(--color-coral)",
          soft: "var(--color-coral-soft)",
        },
        caution: {
          DEFAULT: "var(--color-caution)",
          soft: "var(--color-caution-soft)",
        },
        primary: {
          DEFAULT: "var(--color-primary)",
          soft: "var(--color-primary-soft)",
        },
        coral: {
          DEFAULT: "var(--color-coral)",
          soft: "var(--color-coral-soft)",
        },
        pistachio: {
          DEFAULT: "var(--color-pistachio)",
          soft: "var(--color-pistachio-soft)",
        },
        vanilla: {
          DEFAULT: "var(--color-vanilla)",
          soft: "var(--color-vanilla-soft)",
        },
        sidebar: "var(--color-sidebar)",

        // NEW Phase 12 semantic tokens
        foreground: "var(--color-foreground)",
        mutedForeground: "var(--color-muted-foreground)",
        secondary: {
          DEFAULT: "var(--color-secondary)",
          foreground: "var(--color-secondary-foreground)",
        },
        accent: {
          DEFAULT: "var(--color-accent)",
          foreground: "var(--color-accent-foreground)",
        },
        destructive: {
          DEFAULT: "var(--color-destructive)",
          soft: "var(--color-destructive-soft)",
        },
        focus: "var(--color-focus)",

        // NEW Phase 12 pastel brand palette — logo/gradient/selective
        // accents only, never a substitute for the semantic tokens above.
        brandPeach: "var(--color-brand-peach)",
        brandLavender: "var(--color-brand-lavender)",
        brandMint: "var(--color-brand-mint)",
        brandCream: "var(--color-brand-cream)",
      },
      backgroundImage: {
        brandGradient: "var(--gradient-brand)",
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        body: ["var(--font-body)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      borderRadius: {
        sm: "2px",
        DEFAULT: "3px",
      },
    },
  },
  plugins: [],
};

export default config;
