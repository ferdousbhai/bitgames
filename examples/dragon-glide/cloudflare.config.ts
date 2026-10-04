import { defineConfig } from "cf/config";

// Each deploy is a new version with its own preview URL, which BitGames pins once it is reviewed.
export default defineConfig({
  worker: {
    name: "bitgames-dragon-glide",
    compatibilityDate: "2026-10-01",
    previewUrls: true,
  },
});
