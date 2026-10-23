import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages serves the site from /<repo>/. Override with VITE_BASE if the repo is renamed.
export default defineConfig({
  base: process.env.VITE_BASE ?? "/Cloudflight-Casino/",
  plugins: [react()],
});
