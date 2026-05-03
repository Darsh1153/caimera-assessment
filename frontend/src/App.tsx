import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";

type Question = {
  id: string;
  prompt: string;
  difficulty: number;
  createdAtMs: number;
};

type LeaderRow = { id: string; name: string; wins: number };

const BACKEND_HTTP =
  (import.meta as any).env?.VITE_BACKEND_URL?.toString?.() ||
  "http://localhost:8080";

function toWsUrl(httpUrl: string) {
  const u = new URL(httpUrl);
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  return u.toString().replace(/\/$/, "");
}

async function apiCreateUser(name: string) {
  const res = await fetch(`${BACKEND_HTTP}/users`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || "Failed to create user");
  return data.user as { id: string; name: string };
}

async function apiLeaderboard() {
  const res = await fetch(`${BACKEND_HTTP}/leaderboard?limit=10`);
  const data = await res.json();
  return (data.leaderboard || []) as LeaderRow[];
}

function App() {
  const [nameInput, setNameInput] = useState("");
  const [user, setUser] = useState<{ id: string; name: string } | null>(null);
  const [question, setQuestion] = useState<Question | null>(null);
  const [answer, setAnswer] = useState("");
  const [status, setStatus] = useState<string>("");
  const [connected, setConnected] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderRow[]>([]);

  const wsUrl = useMemo(() => `${toWsUrl(BACKEND_HTTP)}/ws`, []);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiLeaderboard().then((rows) => {
      if (!cancelled) setLeaderboard(rows);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    ws.onopen = () => {
      setConnected(true);
      setStatus("");
    };
    ws.onclose = () => {
      setConnected(false);
      setStatus("Disconnected. Refresh to reconnect.");
    };
    ws.onerror = () => {
      setStatus("WebSocket error.");
    };
    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type === "question") {
          setQuestion(msg.question);
          setAnswer("");
          setStatus("");
        }
        if (msg.type === "winner") {
          const w = msg.winner;
          setStatus(`Winner: ${w.name} (answer: ${msg.answer})`);
          apiLeaderboard().then(setLeaderboard);
        }
        if (msg.type === "result") {
          if (msg.ok === false) {
            setStatus(msg.reason || "Error");
            return;
          }
          if (msg.correct === false) setStatus("Incorrect — try again.");
          if (msg.correct === true && msg.won === false)
            setStatus("Correct, but someone else was first.");
          if (msg.correct === true && msg.won === true)
            setStatus("You won! Next question incoming…");
        }
      } catch {
        void 0;
      }
    };
    return () => {
      ws.close();
    };
  }, [wsUrl]);

  async function onJoin() {
    try {
      setStatus("");
      const created = await apiCreateUser(nameInput);
      setUser(created);
      setStatus(`Joined as ${created.name}`);
      apiLeaderboard()
        .then(setLeaderboard)
        .catch(() => {});
    } catch (e: any) {
      setStatus(e?.message || "Failed to join");
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user || !question) return;
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setStatus("Not connected.");
      return;
    }
    ws.send(
      JSON.stringify({
        type: "submit",
        userId: user.id,
        name: user.name,
        questionId: question.id,
        answer,
      }),
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              Be the first to answer
            </h1>
          </div>
          <div className="text-sm">
            <span
              className={
                connected
                  ? "inline-flex items-center rounded-full bg-emerald-500/15 px-3 py-1 text-emerald-300"
                  : "inline-flex items-center rounded-full bg-rose-500/15 px-3 py-1 text-rose-300"
              }
            >
              {connected ? "Connected" : "Disconnected"}
            </span>
          </div>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl shadow-black/20">
              {!user ? (
                <div className="flex flex-col gap-4">
                  <div className="text-slate-300">
                    Pick a username to join the game.
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <input
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      placeholder="e.g. darshan"
                      className="w-full rounded-xl border border-slate-700 bg-slate-950/40 px-4 py-3 text-slate-100 outline-none ring-0 focus:border-slate-500"
                      maxLength={32}
                    />
                    <button
                      onClick={() => void onJoin()}
                      disabled={!nameInput.trim()}
                      className="rounded-xl bg-indigo-500 px-5 py-3 font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Join
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-slate-300">
                      Playing as{" "}
                      <span className="font-semibold text-slate-100">
                        {user.name}
                      </span>
                    </div>
                    {question ? (
                      <div className="text-xs text-slate-400">
                        Difficulty{" "}
                        <span className="font-semibold text-slate-200">
                          {question.difficulty}
                        </span>
                      </div>
                    ) : null}
                  </div>

                  <div className="rounded-xl bg-slate-950/50 p-5">
                    <div className="text-sm text-slate-400">Problem</div>
                    <div className="mt-2 font-mono text-2xl">
                      {question ? question.prompt : "Loading…"}
                    </div>
                  </div>

                  <form
                    onSubmit={onSubmit}
                    className="flex flex-col gap-3 sm:flex-row"
                  >
                    <input
                      value={answer}
                      onChange={(e) => setAnswer(e.target.value)}
                      placeholder="Your answer"
                      className="w-full rounded-xl border border-slate-700 bg-slate-950/40 px-4 py-3 font-mono text-slate-100 outline-none focus:border-slate-500"
                    />
                    <button
                      type="submit"
                      disabled={!question || !answer.trim()}
                      className="rounded-xl bg-emerald-500 px-5 py-3 font-medium text-emerald-950 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Submit
                    </button>
                  </form>

                  {status ? (
                    <div className="rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3 text-sm text-slate-200">
                      {status}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl shadow-black/20">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-slate-400">Bonus</div>
                <div className="text-lg font-semibold">High Scores</div>
              </div>
              <button
                onClick={() =>
                  void apiLeaderboard()
                    .then(setLeaderboard)
                    .catch((e: any) =>
                      setStatus(e?.message || "Failed to refresh leaderboard"),
                    )
                }
                className="rounded-lg border border-slate-700 bg-slate-950/40 px-3 py-2 text-xs text-slate-200 hover:border-slate-500"
              >
                Refresh
              </button>
            </div>
            <div className="mt-4 space-y-2">
              {leaderboard.length ? (
                leaderboard.map((r, idx) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/30 px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-7 text-sm font-semibold text-slate-400">
                        #{idx + 1}
                      </div>
                      <div className="font-medium">{r.name}</div>
                    </div>
                    <div className="font-mono text-slate-200">{r.wins}</div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-slate-400">No scores yet.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
