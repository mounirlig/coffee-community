const express = require("express");
const { Pool } = require("pg");

const app = express();
const port = Number(process.env.PORT || 3001);
const databaseUrl = process.env.DATABASE_URL;
const corsOrigin = process.env.CORS_ORIGIN || "*";

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const pool = new Pool({
  connectionString: databaseUrl,
});

app.use(express.json());
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", corsOrigin);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

app.get("/healthz", (_req, res) => {
  res.status(200).send("ok");
});

app.post("/api/rpc/:name", async (req, res) => {
  const rpcName = req.params.name;
  const args = req.body || {};

  if (!/^[a-zA-Z0-9_]+$/.test(rpcName)) {
    res.status(400).json({ error: { message: "Invalid RPC name" } });
    return;
  }

  const argKeys = Object.keys(args);
  const placeholders = argKeys.map((_, index) => `$${index + 1}`).join(", ");
  const values = argKeys.map((key) => args[key]);
  const sql = argKeys.length
    ? `select * from public.${rpcName}(${placeholders})`
    : `select * from public.${rpcName}()`;

  try {
    const result = await pool.query(sql, values);
    if (result.rows.length === 1) {
      const firstRow = result.rows[0];
      const firstKey = Object.keys(firstRow)[0];
      if (Object.keys(firstRow).length === 1 && firstKey === rpcName) {
        res.json({ data: firstRow[firstKey], error: null });
        return;
      }
    }
    res.json({ data: result.rows, error: null });
  } catch (error) {
    res.status(400).json({ error: { message: error.message } });
  }
});

app.listen(port, () => {
  // Keep startup output minimal for easy log scanning.
  console.log(`Coffee API listening on :${port}`);
});
