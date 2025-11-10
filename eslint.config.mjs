import js from "@eslint/js";
import tseslint from "typescript-eslint";
import nextPlugin from "@next/eslint-plugin-next";

/**
 * Flat config único (ESLint v9).
 * - Ignora .next, node_modules, build outputs, etc.
 * - Reglas base JS + TypeScript (type-checked)
 * - Plugin Next activado con un set no invasivo
 * - Override para rutas API (apagamos no-explicit-any por ahora)
 */
export default [
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    ignores: [
      "node_modules/**",
      ".next/**",
      "dist/**",
      "out/**",
      "coverage/**",
      "build/**",
      "tsconfig.tsbuildinfo"
    ],
  },

  // Recomendadas de JS
  js.configs.recommended,

  // Recomendadas de TS con type-check
  ...tseslint.configs.recommendedTypeChecked,

  // Plugin de Next
  {
    plugins: {
      "@next/next": nextPlugin,
    },
    rules: {
      // Ajustes “amigables”
      "@next/next/no-img-element": "off",
      "@next/next/no-html-link-for-pages": "off",
    },
  },

  // Override temporal para API: bajamos ruido de "any" mientras tipamos luego
  {
    files: ["app/api/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },

  // Opciones de parser para reglas type-aware
  {
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
];
