import type { IncomingMessage, ServerResponse } from "node:http";

const appPromise = import("../apps/api/src/app.js").then(async ({ buildApp }) => {
  const app = buildApp();
  await app.ready();
  return app;
});

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  const app = await appPromise;
  const incomingUrl = new URL(request.url || "/", "http://vercel.local");
  const forwardedPath = incomingUrl.searchParams.get("__path") || "";
  incomingUrl.searchParams.delete("__path");
  const query = incomingUrl.searchParams.toString();
  request.url = `/${forwardedPath}${query ? `?${query}` : ""}`;
  app.server.emit("request", request, response);
}
