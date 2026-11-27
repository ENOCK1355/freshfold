import type { Request, Response } from "express";
import { waitUntil } from "@vercel/functions";
import { createApplication } from "../apps/api/src/application.js";
import { loadConfig } from "../apps/api/src/config.js";
import { openDatabase } from "../apps/api/src/database.js";
import { createHttpApi } from "../apps/api/src/http.js";

let instance: ReturnType<typeof initialize> | undefined;
let lastMaintenance = 0;
let lastReconciliation = 0;
async function initialize() {
  const config = loadConfig();
  if (!["staging", "production"].includes(config.env) || !config.databaseUrl)
    throw new Error(
      "Vercel requires an isolated staging or production PostgreSQL environment.",
    );
  const database = await openDatabase(config);
  const application = createApplication(database.db, config);
  await application.initialize();
  return { application, server: createHttpApi(application) };
}
export default async function handler(req: Request, res: Response) {
  try {
    const url = new URL(req.url || "/api", "http://internal");
    if (url.pathname === "/api/index" && url.searchParams.has("route")) {
      const route = url.searchParams.get("route")!;
      url.searchParams.delete("route");
      req.url = `/api/${route}${url.search}`;
    }
    const runtime = await (instance ||= initialize().catch((error) => {
      instance = undefined;
      throw error;
    }));
    await new Promise<void>((resolve) => {
      res.once("finish", () => {
        // Durable jobs survive the function. waitUntil keeps this invocation
        // alive long enough to process signed webhooks and current activity.
        if (
          Date.now() - lastMaintenance > 15000 ||
          req.url?.includes("webhooks/paystack")
        ) {
          lastMaintenance = Date.now();
          const reconcile = Date.now() - lastReconciliation >= 60000;
          if (reconcile) lastReconciliation = Date.now();
          waitUntil(
            (async () => {
              if (reconcile) await runtime.application.jobs.reconcile();
              await runtime.application.jobs.tick();
            })().catch((error) =>
              console.error("maintenance_failed", error.name),
            ),
          );
        }
        resolve();
      });
      runtime.server(req, res);
    });
  } catch (error) {
    console.error(
      "api_initialization_failed",
      error instanceof Error ? error.name : "UnknownError",
    );
    if (!res.headersSent) {
      res.statusCode = 503;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          message:
            "The service is temporarily unavailable. Please try again shortly.",
        }),
      );
    }
  }
}
