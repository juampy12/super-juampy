import js from "@eslint/js";
import tseslint from "typescript-eslint";
import nextPlugin from "@next/eslint-plugin-next";

export default [
  // Ignora build y archivos auto-generados
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "out/**",
      "next-env.d.ts",
      "app/_shims/**",
      "**/.backup-*",
      "**/.health/**",
      "**/*.backup.*",
      "**/*.broken.*",
      "**/pages_*"
    ]
  },

  // Reglas base recomendadas
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Reglas de "bajar ruido" para verificación y build
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }],
      "@typescript-eslint/ban-ts-comment": "warn",
      "no-empty": "warn",
    },
  },

  // Plugin Next (silencia algunos avisos) — flat config
  {
    plugins: {
      "@next/next": nextPlugin,
    },
    rules: {
      "@next/next/no-img-element": "off",
      "@next/next/no-html-link-for-pages": "off",
    },
  },
];

/** Overrides específicos para rutas API: reducimos ruido mientras tipamos luego */
export default [
  ...(typeof module !== 'undefined' && module.exports ? module.exports : []),
  {
    files: ["app/api/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off"
    }
  }
];
