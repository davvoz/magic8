import js from "@eslint/js";

const browserGlobals = {
  window: "readonly",
  document: "readonly",
  HTMLCanvasElement: "readonly",
  CanvasRenderingContext2D: "readonly",
  requestAnimationFrame: "readonly",
  cancelAnimationFrame: "readonly",
  localStorage: "readonly",
  fetch: "readonly",
  crypto: "readonly",
  globalThis: "readonly",
  Storage: "readonly",
  performance: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  URL: "readonly",
};

const nodeGlobals = {
  process: "readonly",
  URL: "readonly",
  structuredClone: "readonly",
  console: "readonly",
  performance: "readonly",
};

/** Rules mirroring the SonarQube checks we care about most (see docs/ARCHITECTURE.md §1.7). */
const qualityRules = {
  "no-eval": "error",
  "no-implied-eval": "error",
  "no-new-func": "error",
  "eqeqeq": ["error", "always"],
  "no-param-reassign": ["error", { props: true }],
  "no-nested-ternary": "error",
  "no-console": "error",
  "no-var": "error",
  "prefer-const": "error",
  "complexity": ["error", 12],
  "max-depth": ["error", 3],
  "max-params": ["error", 4],
  "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
  "no-empty": "error",
  "no-empty-function": "error",
  "no-else-return": "error",
  "no-lonely-if": "error",
  "no-throw-literal": "error",
  "no-shadow": "error",
  "no-prototype-builtins": "error",
  "curly": ["error", "all"],
};

export default [
  js.configs.recommended,
  {
    files: ["src/**/*.js"],
    languageOptions: { ecmaVersion: 2022, sourceType: "module", globals: browserGlobals },
    rules: qualityRules,
  },
  {
    files: ["src/domain/**/*.js", "src/application/**/*.js"],
    // These layers must stay browser-agnostic; nothing from the browser is in scope.
    languageOptions: { globals: {} },
  },
  {
    // Presentation layers mutate objects they are handed by design: the Canvas 2D API is driven by
    // setting properties on the passed-in context, and a retained widget tree sets parent/hover/focus
    // state on its nodes. Reassigning the parameter itself stays forbidden (matches Sonar S1226).
    files: ["src/rendering/**/*.js", "src/input/**/*.js"],
    rules: { "no-param-reassign": ["error", { props: false }] },
  },
  {
    // The console-backed Logger implementation is the single sanctioned use of console in src/.
    files: ["src/infrastructure/logging/ConsoleLogger.js"],
    languageOptions: { globals: { console: "readonly" } },
    rules: { "no-console": "off" },
  },
  {
    files: ["test/**/*.js", "tools/**/*.js"],
    languageOptions: { ecmaVersion: 2022, sourceType: "module", globals: nodeGlobals },
    rules: { ...qualityRules, "no-console": "off" },
  },
  {
    // The preview harness runs in the browser (it boots the real presentation stack for screenshots).
    files: ["tools/preview/**/*.js"],
    languageOptions: { ecmaVersion: 2022, sourceType: "module", globals: browserGlobals },
    rules: qualityRules,
  },
];
