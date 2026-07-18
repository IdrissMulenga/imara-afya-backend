// eslint.config.js (ESLint v9+ flat config)
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import prettier from "eslint-plugin-prettier";

/** @type {import('eslint').Linter.FlatConfig[]} */
export default [
    // Ignore build artifacts & deps
    { ignores: ["dist", "node_modules"] },

    {
        files: ["src/**/*.{ts,js}"],

        languageOptions: {
            parser: tsparser,
            parserOptions: {
                ecmaVersion: "latest",
                sourceType: "module",
                // Keep this OFF initially to avoid project parsing errors & slow lint:
                // project: "./tsconfig.json",
            },
        },

        plugins: {
            "@typescript-eslint": tseslint,
            prettier,
        },

        rules: {
            // Start from TS recommended (lite) set:
            // (We can't spread from a preset inside flat config easily, so just add the key rules you want)
            "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],

            // Prettier formatting as ESLint errors
            "prettier/prettier": "error",
        },
    },
];
