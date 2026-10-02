import type { IncomingMessage, ServerResponse } from "node:http";

const appPromise = import("../apps/api/src/app.js").then(async ({ buildApp }) => {
  const app = buildApp();
  await app.ready();
  return app;
});

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  const app = await appPromise;
  request.url = request.url?.replace(/^\/api/, "") || "/";
  app.server.emit("request", request, response);
}
