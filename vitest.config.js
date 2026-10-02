import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          compatibilityFlags: ["nodejs_compat"],
          d1Databases: ["DB"],
          kvNamespaces: ["AUTH_TOKENS"],
          bindings: {
            SESSION_SIGNING_KEY: "test-signing-key-1234567890",
            RESEND_API_KEY: "test-resend-key",
            BASE_URL: "http://localhost",
          },
        },
      },
    },
  },
});
