import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import leasesRouter from "./routes/leases";
import schedulesRouter from "./routes/schedules";
import journalsRouter from "./routes/journals";
import settingsRouter from "./routes/settings";
import ratesRouter from "./routes/rates";
import entitiesRouter from "./routes/entities";
import authRouter from "./routes/auth";
import fxratesRouter from "./routes/fxrates";
import { requireAuth } from "./middleware/auth";

const app = express();

app.use(cors());
app.use(express.json({ limit: "50mb" }));

// Public routes
app.use("/api/auth", authRouter);
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// Auth middleware for all data routes
const auth = requireAuth as unknown as (req: Request, res: Response, next: NextFunction) => void;
app.use("/api/leases", auth, leasesRouter);
app.use("/api/schedules", auth, schedulesRouter);
app.use("/api/journals", auth, journalsRouter);
app.use("/api/settings", auth, settingsRouter);
app.use("/api/rates", auth, ratesRouter);
app.use("/api/fxrates", auth, fxratesRouter);
app.use("/api/entities", auth, entitiesRouter);

// Only listen when running locally (not on Vercel)
if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`RoU-lio server running on http://localhost:${PORT}`);
  });
}

export default app;
