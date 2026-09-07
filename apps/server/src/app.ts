import { Hono } from "hono";
import { accountsRoute } from "./routes/accounts.js";
import { dashboardRoute } from "./routes/dashboard.js";

export const app = new Hono();

app.get("/api/health", (c) => c.json({ ok: true }));
app.route("/api/accounts", accountsRoute);
app.route("/api/dashboard", dashboardRoute);
