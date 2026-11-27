import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import type { Application } from "./application.js";

export function createHttpApi(application: Application) {
  const server = express();
  server.disable("x-powered-by");
  server.set(
    "trust proxy",
    Number(process.env.TRUST_PROXY_HOPS || (process.env.VERCEL ? 1 : 0)),
  );
  server.use(helmet(), cookieParser());
  server.use(
    express.json({
      limit: "8mb",
      verify: (req, _res, bytes) => {
        (req as any).rawBody = bytes;
      },
    }),
  );
  server.all("/api/{*path}", (req, res) => void application.handle(req, res));
  server.use((_req, res) =>
    res.status(404).json({ message: "That resource was not found." }),
  );
  server.use((error: any, _req: any, res: any, _next: any) => {
    res
      .status(error.type === "entity.too.large" ? 413 : 400)
      .json({
        message:
          error.type === "entity.too.large"
            ? "This upload is too large."
            : "The request could not be read.",
      });
  });
  return server;
}
