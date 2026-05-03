import "dotenv/config";
import http from "http";
import express from "express";
import cors from "cors";
import { WebSocketServer } from "ws";

import { ensureSchema, getLeaderboard, getOrCreateUserByName, incrementWins } from "./db.js";
import { createRedis, LUA_TRY_ADVANCE, LUA_TRY_WIN } from "./redis.js";
import { generateQuestion } from "./questions.js";

const PORT = process.env.PORT ? Number(process.env.PORT) : 8080;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));

app.get("/leaderboard", async (req, res) => {
  const limit = req.query.limit ? Math.max(1, Math.min(50, Number(req.query.limit))) : 10;
  const rows = await getLeaderboard(limit);
  res.json({ leaderboard: rows });
});

app.post("/users", async (req, res) => {
  try {
    const { name } = req.body || {};
    const user = await getOrCreateUserByName(String(name || ""));
    res.json({ user });
  } catch (e) {
    res.status(400).json({ error: e?.message || "Invalid request" });
  }
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

const redis = createRedis();
redis.on("error", (err) => {
  console.error("[redis] error:", err?.message || err);
});
redis.on("connect", () => {
  console.log("[redis] connected");
});

let current = null;
let questionSeq = 0;

function winnerKey(qid) {
  return `quiz:winner:${qid}`;
}

function advanceKey(qid) {
  return `quiz:advance:${qid}`;
}

function serverTimeMs() {
  return Date.now();
}

function normalizeAnswer(str) {
  return String(str ?? "").trim().replace(/\s+/g, "");
}

function wsSend(ws, obj) {
  if (ws.readyState !== 1) return;
  ws.send(JSON.stringify(obj));
}

function broadcast(obj) {
  if (!wss.clients.size) return;
  const payload = JSON.stringify(obj);
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(payload);
  }
}

function nextQuestion(reason = "init") {
  questionSeq += 1;
  const difficulty = Math.min(1 + Math.floor(questionSeq / 3), 10);
  const q = generateQuestion(difficulty);
  const id = `${serverTimeMs()}-${questionSeq}`;
  current = { id, prompt: q.prompt, answer: q.answer, difficulty, createdAtMs: serverTimeMs() };
  broadcast({
    type: "question",
    question: {
      id: current.id,
      prompt: current.prompt,
      difficulty: current.difficulty,
      createdAtMs: current.createdAtMs
    },
    reason,
    serverTimeMs: serverTimeMs()
  });
}

async function tryWin({ userId, name, answer }) {
  if (!current) return { ok: false, reason: "No active question" };
  const qid = current.id;

  const normalized = normalizeAnswer(answer);
  if (!normalized) return { ok: false, reason: "Empty answer" };

  const isCorrect = normalized === normalizeAnswer(current.answer);
  if (!isCorrect) return { ok: true, correct: false };

  const didWin = await redis.eval(LUA_TRY_WIN, 1, winnerKey(qid), String(userId), String(serverTimeMs()));
  if (Number(didWin) !== 1) {
    return { ok: true, correct: true, won: false };
  }

  const canAdvance = await redis.eval(LUA_TRY_ADVANCE, 1, advanceKey(qid), String(serverTimeMs()));
  if (Number(canAdvance) !== 1) {
    return { ok: true, correct: true, won: true, advanced: false };
  }

  const wins = await incrementWins(userId);
  broadcast({
    type: "winner",
    questionId: qid,
    winner: { userId, name, wins },
    answer: current.answer,
    serverTimeMs: serverTimeMs()
  });

  setTimeout(() => nextQuestion("winner"), 900);

  return { ok: true, correct: true, won: true, advanced: true, wins };
}

wss.on("connection", (ws) => {
  wsSend(ws, { type: "hello", serverTimeMs: serverTimeMs() });

  if (current) {
    wsSend(ws, {
      type: "question",
      question: {
        id: current.id,
        prompt: current.prompt,
        difficulty: current.difficulty,
        createdAtMs: current.createdAtMs
      },
      reason: "sync",
      serverTimeMs: serverTimeMs()
    });
  }

  ws.on("message", async (raw) => {
    let msg;
    try {
      const txt = typeof raw === "string" ? raw : raw.toString("utf8");
      msg = JSON.parse(txt);
    } catch {
      return;
    }
    if (!msg || typeof msg.type !== "string") return;

    if (msg.type === "submit") {
      const { userId, name, answer, questionId } = msg;

      if (!current || questionId !== current.id) {
        wsSend(ws, {
          type: "result",
          ok: false,
          reason: "Stale question",
          currentQuestionId: current?.id ?? null,
          serverTimeMs: serverTimeMs()
        });
        return;
      }

      if (!userId || !name) {
        wsSend(ws, {
          type: "result",
          ok: false,
          reason: "Missing user",
          serverTimeMs: serverTimeMs()
        });
        return;
      }

      try {
        const result = await tryWin({ userId, name, answer });
        wsSend(ws, { type: "result", ...result, serverTimeMs: serverTimeMs() });
      } catch (e) {
        wsSend(ws, {
          type: "result",
          ok: false,
          reason: e?.message || "Server error",
          serverTimeMs: serverTimeMs()
        });
      }
      return;
    }

    if (msg.type === "ping") {
      wsSend(ws, { type: "pong", serverTimeMs: serverTimeMs() });
    }
  });
});

async function main() {
  const errors = [];
  try {
    await ensureSchema();
  } catch (e) {
    errors.push(
      `PostgreSQL connection failed. If you're using Docker, run: docker compose up -d\n` +
        `Current PGHOST=${process.env.PGHOST} PGPORT=${process.env.PGPORT} PGUSER=${process.env.PGUSER}`
    );
  }

  try {
    await redis.connect();
    await redis.ping();
  } catch (e) {
    errors.push(
      `Redis connection failed. If you're using Docker, run: docker compose up -d\n` +
        `Current REDIS_URL=${process.env.REDIS_URL}`
    );
  }

  if (errors.length) {
    console.error(errors.join("\n\n"));
    try {
      redis.disconnect();
    } catch {}
    process.exit(1);
  }

  nextQuestion("init");

  server.listen(PORT, () => {
    console.log(`Backend listening on http://localhost:${PORT}`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

