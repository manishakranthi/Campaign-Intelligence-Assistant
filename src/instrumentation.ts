/**
 * Called once per fresh Next.js server instance, before it starts serving requests -- the
 * official hook for startup work (see node_modules/next/dist/docs/.../instrumentation.md).
 * There's no login/session system in this app, so "clear uploaded campaigns after the session"
 * is implemented as "clear them every time the server boots."
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { cleanupUploadedCampaigns } = await import("./lib/uploaded-campaign-store");
  try {
    await cleanupUploadedCampaigns();
    console.log("[Startup] Cleared uploaded campaigns from any previous session.");
  } catch (err) {
    // Must not block server startup -- e.g. the service account's Editor access isn't set up
    // yet, or a transient network issue. Log clearly and let the server start regardless.
    console.error("[Startup] Failed to clear uploaded campaigns:", err instanceof Error ? err.message : err);
  }
}
