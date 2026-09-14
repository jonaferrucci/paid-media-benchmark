import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "var(--color-background)",
        surface: "var(--color-surface)",
        surface2: "var(--color-surface-2)",
        ink: {
          900: "var(--color-text-primary)",
          700: "var(--color-text-primary)",
          600: "var(--color-text-secondary)",
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
