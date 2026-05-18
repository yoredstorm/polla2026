import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#0a0a0f",
        surface: "#1a1a2e",
        "surface-2": "#16213e",
        accent: "#00ff88",
        "accent-dim": "#00cc6a",
        success: "#00ff88",
        danger: "#ff4757",
        warning: "#ffa502",
        muted: "#8892a4",
        live: "#ff4757",
      },
      fontFamily: {
        display: ["Bebas Neue", "sans-serif"],
        body: ["DM Sans", "sans-serif"],
        sans: ["DM Sans", "sans-serif"],
      },
      backgroundImage: {
        glass:
          "linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.01) 100%)",
        "ambient-mesh":
          "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(0,255,136,0.12), transparent), radial-gradient(ellipse 60% 40% at 100% 50%, rgba(0,255,136,0.04), transparent)",
      },
      boxShadow: {
        glow: "0 0 20px rgba(0, 255, 136, 0.25)",
        "glow-sm": "0 0 12px rgba(0, 255, 136, 0.15)",
        "glow-danger": "0 0 16px rgba(255, 71, 87, 0.2)",
      },
      backdropBlur: {
        xs: "2px",
      },
    },
  },
  plugins: [],
};

export default config;
