export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/premium/")) {
      return new Response("Forbidden", { status: 403 });
    }
    // /api/* handled in later tasks; everything else → static assets.
    return env.ASSETS.fetch(request);
  },
};
