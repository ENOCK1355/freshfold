import { Worker, Queue } from "bullmq";
import { loadConfig } from "./config.js";
import { openDatabase } from "./database.js";
import { createApplication } from "./application.js";
const config = loadConfig();
const database = await openDatabase(config);
const app = createApplication(database.db, config);
if (config.redis) {
  const url = new URL(config.redis);
  const connection = {
    host: url.hostname,
    port: Number(url.port) || 6379,
    password: url.password || undefined,
    ...(url.protocol === "rediss:" ? { tls: {} } : {}),
  };
  const queue = new Queue("fresh-fold-maintenance", { connection });
  await queue.upsertJobScheduler(
    "business-jobs",
    { every: 30000 },
    { name: "tick", data: {} },
  );
  const worker = new Worker(
    "fresh-fold-maintenance",
    async () => {
      await app.jobs.reconcile();
      return app.jobs.tick();
    },
    { connection, concurrency: 1 },
  );
  worker.on("failed", (_job, e) =>
    console.error("Maintenance job failed:", e.name),
  );
  console.log("Fresh Fold BullMQ worker ready.");
} else {
  setInterval(
    () =>
      void app.jobs
        .reconcile()
        .then(() => app.jobs.tick())
        .catch((error) => console.error("Maintenance job failed:", error.name)),
    30000,
  );
  console.log(
    "Fresh Fold durable database job worker ready. Configure REDIS_URL to use BullMQ scheduling.",
  );
}
