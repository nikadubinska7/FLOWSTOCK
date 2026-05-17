import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        cockpit: {
          bg: "#050b17",
          panel: "rgba(15, 23, 42, 0.78)",
          panel2: "rgba(17, 27, 48, 0.86)",
          panel3: "rgba(30, 41, 67, 0.92)",
          line: "rgba(148, 163, 184, 0.14)",
          line2: "#31517d",
          text: "#f5f8ff",
          muted: "#9aa8bf",
          accent: "#2563eb",
          accent2: "#3b82f6",
          cyan: "#38bdf8",
          green: "#34d399",
          amber: "#f59e0b",
          red: "#ff5a5f"
        }
      },
      boxShadow: {
        cockpit: "0 24px 80px rgba(2,8,23,0.48), inset 0 1px 0 rgba(255,255,255,0.035)",
        action: "0 18px 38px rgba(37,99,235,0.32)",
        glow: "0 0 0 1px rgba(96,165,250,0.18), 0 20px 80px rgba(37,99,235,0.16)"
      }
    }
  },
  plugins: []
};

export default config;
