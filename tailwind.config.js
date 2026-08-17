/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        white: "rgb(var(--fg) / <alpha-value>)",
        ink: {
          DEFAULT: "rgb(var(--ink) / <alpha-value>)",
          soft: "rgb(var(--ink-soft) / <alpha-value>)",
          muted: "rgb(var(--ink-muted) / <alpha-value>)",
        },
        moon: {
          50: "rgb(var(--moon-50) / <alpha-value>)",
          100: "rgb(var(--moon-100) / <alpha-value>)",
          300: "rgb(var(--moon-300) / <alpha-value>)",
          400: "rgb(var(--moon-400) / <alpha-value>)",
          500: "rgb(var(--moon-500) / <alpha-value>)",
          600: "rgb(var(--moon-600) / <alpha-value>)",
          700: "rgb(var(--moon-700) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "rgb(var(--accent) / <alpha-value>)",
          soft: "rgb(var(--accent-soft) / <alpha-value>)",
        },
      },
      fontFamily: {
        sans: ["Outfit", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
      glow: "0 0 0 1px rgba(255,255,255,0.06), 0 8px 30px rgba(0,0,0,0.45)",
      card: "0 1px 0 rgba(255,255,255,0.04) inset, 0 20px 40px -24px rgba(0,0,0,0.7)",
      },
      backgroundImage: {
        "space-radial":
          "radial-gradient(1200px 600px at 80% -10%, rgba(255,255,255,0.04), transparent 60%), radial-gradient(800px 500px at 10% 10%, rgba(255,255,255,0.03), transparent 55%)",
      },
    },
  },
  plugins: [],
};
