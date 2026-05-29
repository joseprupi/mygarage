import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        asphalt: "#111827",
        petrol: "#2563eb",
        garage: "#f8fafc"
      }
    }
  },
  plugins: []
};

export default config;
