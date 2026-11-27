import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Module } from "@nestjs/common";
import express from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { loadConfig } from "./config.js";
import { openDatabase } from "./database.js";
import { createApplication } from "./application.js";
const config = loadConfig();
const database = await openDatabase(config, !config.databaseUrl);
const application = createApplication(database.db, config);
await application.initialize();
@Module({
  providers: [{ provide: "FRESH_FOLD_APPLICATION", useValue: application }],
})
class MarketplaceModule {}
@Module({ imports: [MarketplaceModule] })
class AppModule {}
const app = await NestFactory.create(AppModule, {
  bodyParser: false,
  logger: ["error", "warn", "log"],
});
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
        formAction: ["'self'", "https://checkout.paystack.com"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: config.env === "production" ? [] : null,
      },
    },
  }),
);
app.use(cookieParser());
app.use(
  express.json({
    limit: "8mb",
    verify: (req, _res, buf) => {
      (req as any).rawBody = buf;
    },
  }),
);
const server = app.getHttpAdapter().getInstance();
server.disable("x-powered-by");
const proxyHops = Number(process.env.TRUST_PROXY_HOPS || 0);
if (!Number.isInteger(proxyHops) || proxyHops < 0 || proxyHops > 5)
  throw new Error("TRUST_PROXY_HOPS must be an integer between 0 and 5.");
if (proxyHops) server.set("trust proxy", proxyHops);
server.all("/api/{*path}", (req: any, res: any) =>
  application.handle(req, res),
);
if (config.env !== "production")
  server.use((_req: any, res: any, next: any) => {
    res.set("X-Robots-Tag", "noindex, nofollow");
    next();
  });
server.get("/robots.txt", (_req: any, res: any) =>
  res
    .type("text/plain")
    .send(
      config.env === "production"
        ? "User-agent: *\nDisallow: /account\nDisallow: /business\nDisallow: /admin\nDisallow: /api\n"
        : "User-agent: *\nDisallow: /\n",
    ),
);
server.get("/sitemap.xml", async (_req: any, res: any) => {
  const routes =
    config.env === "production"
      ? [
          "",
          "find-laundry",
          "how-it-works",
          "student-plus",
          "for-businesses",
          "pricing",
          "about",
          "help",
          "coverage",
        ]
      : [];
  res
    .type("application/xml")
    .send(
      `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${routes.map((p) => `<url><loc>${config.appUrl}/${p}</loc></url>`).join("")}</urlset>`,
    );
});
server.use(
  express.static(path.resolve("dist/web"), {
    index: false,
    maxAge: config.env === "production" ? "1h" : 0,
  }),
);
server.get("/{*path}", async (req: any, res: any) => {
  try {
    let html = await readFile(path.resolve("dist/web/index.html"), "utf8");
    if (config.env !== "production")
      html = html.replace(
        "</head>",
        '<meta name="robots" content="noindex,nofollow"/></head>',
      );
    res.type("html").send(html);
  } catch {
    res
      .status(200)
      .type("html")
      .send(
        '<h1>Fresh Fold API is running</h1><p>Open <a href="http://localhost:5173">the website on port 5173</a> during development.</p>',
      );
  }
});
const timer = setInterval(() => {
  void application.jobs
    .tick()
    .catch((e) => console.error("Background job failure:", e.name));
}, 30000);
timer.unref();
const reconcileTimer = setInterval(() => {
  void application.jobs
    .reconcile()
    .catch((e) => console.error("Reconciliation failure:", e.name));
}, 60000);
reconcileTimer.unref();
app.enableShutdownHooks();
await app.listen(
  config.port,
  process.env.HOST || (config.env === "production" ? "0.0.0.0" : "127.0.0.1"),
);
console.log(
  `Fresh Fold API ready at http://localhost:${config.port} (${config.env}, ${config.mode})`,
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    clearInterval(timer);
    clearInterval(reconcileTimer);
    void app
      .close()
      .then(() => database.close())
      .then(() => process.exit(0));
  });
