import "dotenv/config";
import express from "express";
import cors from "cors";
import leasesRouter from "./routes/leases";
import schedulesRouter from "./routes/schedules";
import journalsRouter from "./routes/journals";
import settingsRouter from "./routes/settings";
import ratesRouter from "./routes/rates";
import entitiesRouter from "./routes/entities";

const app = express();

app.use(cors());
app.use(express.json({ limit: "50mb" }));

app.use("/api/leases", leasesRouter);
app.use("/api/schedules", schedulesRouter);
app.use("/api/journals", journalsRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/rates", ratesRouter);
app.use("/api/entities", entitiesRouter);

app.get("/api/health", (_req, res) => res.json({ ok: true }));

// Only listen when running locally (not on Vercel)
if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`IFRS 16 server running on http://localhost:${PORT}`);
  });
}

export default app;
