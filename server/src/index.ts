import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { getDb } from "./db";
import leasesRouter from "./routes/leases";
import schedulesRouter from "./routes/schedules";
import journalsRouter from "./routes/journals";
import settingsRouter from "./routes/settings";
import ratesRouter from "./routes/rates";
import entitiesRouter from "./routes/entities";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: process.env.CLIENT_URL || "http://localhost:5173" }));
app.use(express.json({ limit: "50mb" }));

// Init DB on startup
getDb();

app.use("/api/leases", leasesRouter);
app.use("/api/schedules", schedulesRouter);
app.use("/api/journals", journalsRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/rates", ratesRouter);
app.use("/api/entities", entitiesRouter);

// Health check
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// Serve client in production
if (process.env.NODE_ENV === "production") {
  const clientDist = path.join(__dirname, "../../client/dist");
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => res.sendFile(path.join(clientDist, "index.html")));
}

app.listen(PORT, () => {
  console.log(`IFRS 16 server running on http://localhost:${PORT}`);
});

export default app;
