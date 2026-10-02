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
            PADDLE_ENV: "sandbox",
            PADDLE_CLIENT_TOKEN: "test_client_token",
            PADDLE_API_KEY: "test_api_key",
            PADDLE_WEBHOOK_SECRET: "pdl_ntfset_test_secret",
            PADDLE_PRICE_MONTHLY: "pri_test_monthly",
            PADDLE_PRICE_YEARLY: "pri_test_yearly",
          },
        },
      },
    },
  },
});
