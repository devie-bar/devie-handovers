import type { Config } from "tailwindcss";

/**
 * Colours and faces come from DESIGN.md (De Vie Design Standard, Part 2).
 * Do not add a value here that is not in that file.
 */
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#17201D",
          soft: "#5C6B66",
          muted: "#8B978F",
        },
        paper: {
          DEFAULT: "#FBFBF8",
          card: "#FFFFFF",
          line: "#E6E8E2",
        },
        // Primary structural colour. White on brand is 8.0:1, so every
        // existing text-white on bg-brand pairing stays AA.
        brand: {
          DEFAULT: "#025B4C",
          soft: "#0B7A63",
          wash: "#E8F0EE",
          deep: "#013D33",
        },
        // Action fill and rules. Copper is a FILL, never body text:
        // #E16000 on paper is 3.6:1. Use copper.deep for copper text (5.2:1),
        // and ink (not white) for text on a copper fill (4.65:1).
        copper: {
          DEFAULT: "#E16000",
          deep: "#B24700",
          soft: "#F0B37A",
        },
        good: { DEFAULT: "#1E7A57", tint: "#E5F2EC", line: "#BFE0CD" },
        warn: { DEFAULT: "#A9781A", tint: "#F6ECCF", line: "#E3D3AD" },
        danger: { DEFAULT: "#C0392B", tint: "#F7E1DE", line: "#E0B8B2" },
        info: { DEFAULT: "#1D5FA8", tint: "#E6EEFA", line: "#C2D5F0" },
      },
      fontFamily: {
        sans: ["Epilogue", "Segoe UI", "system-ui", "-apple-system", "Roboto", "Helvetica", "Arial", "sans-serif"],
        display: ["PP Editorial New", "Cambria", "Hoefler Text", "Georgia", "serif"],
      },
    },
  },
  plugins: [],
};
export default config;
