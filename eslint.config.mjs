import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      // Generated upload payload and local runtime data, not source.
      "deploy-payload/**",
      ".pgdata/**",
      "App_Data/**",
      "public/sw.js",
      "public/workbox-*.js",
    ],
  },
  {
    // server.js is the IIS entry point and must stay CommonJS: httpPlatformHandler
    // launches it with plain `node server.js`, outside any bundler.
    files: ["server.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
];

export default eslintConfig;
