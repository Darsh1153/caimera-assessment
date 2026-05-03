import pg from "pg";

const { Pool } = pg;

function poolConfig() {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    return {
      connectionString: databaseUrl,
      ssl: { rejectUnauthorized: false }
    };
  }
  return {
    host: process.env.PGHOST,
    port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE
  };
}

export const pool = new Pool(poolConfig());

export async function ensureSchema() {
  await pool.query(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS user_scores (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      wins INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_user_scores_wins ON user_scores (wins DESC);
  `);
}

export async function getOrCreateUserByName(name) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name is required");
  if (trimmed.length > 32) throw new Error("Name too long (max 32)");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query("SELECT id, name FROM users WHERE name = $1", [trimmed]);
    if (existing.rowCount) {
      await client.query("COMMIT");
      return existing.rows[0];
    }

    const inserted = await client.query(
      "INSERT INTO users (name) VALUES ($1) RETURNING id, name",
      [trimmed]
    );
    await client.query(
      "INSERT INTO user_scores (user_id, wins) VALUES ($1, 0) ON CONFLICT (user_id) DO NOTHING",
      [inserted.rows[0].id]
    );
    await client.query("COMMIT");
    return inserted.rows[0];
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function incrementWins(userId) {
  const res = await pool.query(
    `INSERT INTO user_scores (user_id, wins)
     VALUES ($1, 1)
     ON CONFLICT (user_id)
     DO UPDATE SET wins = user_scores.wins + 1, updated_at = now()
     RETURNING wins`,
    [userId]
  );
  return res.rows[0]?.wins ?? 0;
}

export async function getLeaderboard(limit = 10) {
  const res = await pool.query(
    `SELECT u.id, u.name, s.wins
     FROM user_scores s
     JOIN users u ON u.id = s.user_id
     ORDER BY s.wins DESC, u.created_at ASC
     LIMIT $1`,
    [limit]
  );
  return res.rows;
}

export async function resetAllUsersAndScores() {
  await pool.query("TRUNCATE TABLE user_scores, users");
}

