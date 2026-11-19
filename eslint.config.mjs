import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Cliente generado por Prisma
    "lib/generated/**",
    // Robot cotizador de oficina (Node + Playwright): proyecto aparte con su propio package.json.
    "robot-oficina/**",
  ]),
]);

export default eslintConfig;
