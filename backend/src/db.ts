import Database, { type Database as DatabaseType } from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(import.meta.dirname, "..", "medchron.db");

const db: DatabaseType = new Database(DB_PATH);

// Enable WAL mode for better concurrent access
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ── Users table ──
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name TEXT DEFAULT NULL,
    reset_token TEXT DEFAULT NULL,
    reset_token_expires TEXT DEFAULT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

// ── Medications ──
db.exec(`
  CREATE TABLE IF NOT EXISTS medications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 0,
    name TEXT NOT NULL,
    dosage TEXT NOT NULL DEFAULT '',
    frequency TEXT NOT NULL DEFAULT '',
    prescribing_doctor TEXT NOT NULL DEFAULT '',
    refill_date TEXT NOT NULL DEFAULT '',
    instructions TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )
`);

// ── Doses ──
db.exec(`
  CREATE TABLE IF NOT EXISTS doses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 0,
    medication_id INTEGER NOT NULL,
    scheduled_date TEXT NOT NULL,
    scheduled_time TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','taken','missed','skipped')),
    taken_at TEXT,
    notes TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (medication_id) REFERENCES medications(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )
`);

// ── Symptoms ──
db.exec(`
  CREATE TABLE IF NOT EXISTS symptoms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 0,
    name TEXT NOT NULL,
    severity INTEGER NOT NULL CHECK(severity >= 1 AND severity <= 5),
    notes TEXT DEFAULT '',
    logged_at TEXT NOT NULL,
    medication_id INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (medication_id) REFERENCES medications(id) ON DELETE SET NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )
`);

// ── Appointments ──
db.exec(`
  CREATE TABLE IF NOT EXISTS appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 0,
    title TEXT NOT NULL,
    doctor_name TEXT NOT NULL DEFAULT '',
    location TEXT NOT NULL DEFAULT '',
    date TEXT NOT NULL,
    time TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )
`);

// ── Migrations: add columns if they don't exist (idempotent) ──

// user_id columns
try { db.exec(`ALTER TABLE medications ADD COLUMN user_id INTEGER NOT NULL DEFAULT 0`); } catch { /* exists */ }
try { db.exec(`ALTER TABLE doses ADD COLUMN user_id INTEGER NOT NULL DEFAULT 0`); } catch { /* exists */ }
try { db.exec(`ALTER TABLE symptoms ADD COLUMN user_id INTEGER NOT NULL DEFAULT 0`); } catch { /* exists */ }
try { db.exec(`ALTER TABLE appointments ADD COLUMN user_id INTEGER NOT NULL DEFAULT 0`); } catch { /* exists */ }

// refill_status and refill_requested_at
try { db.exec(`ALTER TABLE medications ADD COLUMN refill_status TEXT DEFAULT NULL`); } catch { /* exists */ }
try { db.exec(`ALTER TABLE medications ADD COLUMN refill_requested_at TEXT DEFAULT NULL`); } catch { /* exists */ }

// premium columns
try { db.exec(`ALTER TABLE users ADD COLUMN is_premium INTEGER NOT NULL DEFAULT 0`); } catch { /* exists */ }
try { db.exec(`ALTER TABLE users ADD COLUMN premium_since TEXT DEFAULT NULL`); } catch { /* exists */ }

// reminder_times — custom reminder times per medication (JSON array of time strings)
try { db.exec(`ALTER TABLE medications ADD COLUMN reminder_times TEXT DEFAULT NULL`); } catch { /* exists */ }

// avatar_color — user profile avatar color
try { db.exec(`ALTER TABLE users ADD COLUMN avatar_color TEXT DEFAULT NULL`); } catch { /* exists */ }

// quantity — medication quantity (e.g. "30 tablets", "60 capsules", "100ml")
try { db.exec(`ALTER TABLE medications ADD COLUMN quantity TEXT NOT NULL DEFAULT ''`); } catch { /* exists */ }

// ── Backfill: assign existing data to first user if one exists and data is unassigned ──
const firstUser = db.prepare("SELECT id FROM users ORDER BY id ASC LIMIT 1").get() as any;
if (firstUser) {
  db.prepare("UPDATE medications SET user_id = ? WHERE user_id = 0").run(firstUser.id);
  db.prepare("UPDATE doses SET user_id = ? WHERE user_id = 0").run(firstUser.id);
  db.prepare("UPDATE symptoms SET user_id = ? WHERE user_id = 0").run(firstUser.id);
  db.prepare("UPDATE appointments SET user_id = ? WHERE user_id = 0").run(firstUser.id);
}

// ── Indexes ──
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  CREATE INDEX IF NOT EXISTS idx_users_reset_token ON users(reset_token);
  CREATE INDEX IF NOT EXISTS idx_medications_user_id ON medications(user_id);
  CREATE INDEX IF NOT EXISTS idx_doses_user_id ON doses(user_id);
  CREATE INDEX IF NOT EXISTS idx_doses_med_date ON doses(medication_id, scheduled_date);
  CREATE INDEX IF NOT EXISTS idx_doses_date ON doses(scheduled_date);
  CREATE INDEX IF NOT EXISTS idx_doses_user_date ON doses(user_id, scheduled_date);
  CREATE INDEX IF NOT EXISTS idx_symptoms_user_id ON symptoms(user_id);
  CREATE INDEX IF NOT EXISTS idx_symptoms_logged_at ON symptoms(logged_at);
  CREATE INDEX IF NOT EXISTS idx_symptoms_med ON symptoms(medication_id);
  CREATE INDEX IF NOT EXISTS idx_symptoms_user_logged ON symptoms(user_id, logged_at);
  CREATE INDEX IF NOT EXISTS idx_appointments_user_id ON appointments(user_id);
  CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(date);
  CREATE INDEX IF NOT EXISTS idx_appointments_user_date ON appointments(user_id, date);
`);

export default db;
