import { defineConfig } from "vite";

export default defineConfig(({ mode }) => {
  const isProduction = mode === "production";

  return {
    root: "src",
    base: "./",
    publicDir: "../static",
    build: {
      outDir: "../dist",
      emptyOutDir: true,
      sourcemap: true,
      minify: isProduction,
      lib: {
        entry: "module.ts",
        formats: ["es"],
        fileName: () => "module.js",
      },
      rolldownOptions: {
        output: {
          keepNames: true,
          manualChunks: undefined,
          codeSplitting: false,
        },
      },
    },
    css: {
      devSourcemap: true,
    },
  };
});
