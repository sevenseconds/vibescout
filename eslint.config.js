import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: ["ui/dist/**/*", "ui/node_modules/**/*", "dist/**/*", "src/ui-dist/**/*"]
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
    rules: {
      "indent": ["error", 2],
      "linebreak-style": ["error", "unix"],
      "quotes": ["error", "double"],
      "semi": ["error", "always"],
      "no-unused-vars": ["warn"],
    },
  },
];
