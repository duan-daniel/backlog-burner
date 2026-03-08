import aiosqlite
import os
import json
from datetime import datetime

_default_db = "/data/app.db" if os.path.isdir("/data") else "backlog_burner.db"
DB_PATH = os.environ.get("DB_PATH", _default_db)


async def get_db():
    db = await aiosqlite.connect(DB_PATH)
    db.row_factory = aiosqlite.Row
    return db


async def init_db():
    db = await get_db()
    await db.executescript("""
        CREATE TABLE IF NOT EXISTS issues (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            issue_number INTEGER UNIQUE NOT NULL,
            title TEXT NOT NULL,
            body TEXT DEFAULT '',
            labels TEXT DEFAULT '[]',
            state TEXT DEFAULT 'open',
            created_at TEXT,
            html_url TEXT DEFAULT '',
            repo TEXT DEFAULT '',
            imported_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS triage (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            issue_number INTEGER UNIQUE NOT NULL,
            issue_type TEXT DEFAULT 'bug',
            complexity TEXT DEFAULT 'easy',
            devin_fit TEXT DEFAULT 'no',
            candidate_score INTEGER DEFAULT 0,
            recommendation TEXT DEFAULT 'dont_delegate',
            reasoning TEXT DEFAULT '',
            generated_prompt TEXT DEFAULT '',
            acceptance_criteria TEXT DEFAULT '',
            triaged_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (issue_number) REFERENCES issues(issue_number)
        );

        CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            issue_number INTEGER NOT NULL,
            session_id TEXT,
            session_url TEXT DEFAULT '',
            pr_url TEXT DEFAULT '',
            pr_status TEXT DEFAULT '',
            status TEXT DEFAULT 'pending',
            latest_state TEXT DEFAULT 'pending',
            playbook_id TEXT DEFAULT '',
            prompt TEXT DEFAULT '',
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (issue_number) REFERENCES issues(issue_number)
        );
    """)
    # Migrate: add pr_status column if missing (for existing DBs)
    try:
        await db.execute("SELECT pr_status FROM sessions LIMIT 1")
    except Exception:
        await db.execute("ALTER TABLE sessions ADD COLUMN pr_status TEXT DEFAULT ''")

    await db.commit()
    await db.close()
