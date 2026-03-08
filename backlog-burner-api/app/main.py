import os
import json
from pathlib import Path
from datetime import datetime

from dotenv import load_dotenv

# Load .env from the app directory and parent directory
load_dotenv(Path(__file__).resolve().parent.parent / ".env")
load_dotenv()  # also try cwd

import httpx
import aiosqlite
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.database import get_db, init_db, DB_PATH
from app.scoring import triage_issue
from app.prompt_generator import generate_prompt, generate_acceptance_criteria

app = FastAPI(title="Backlog Burner API")

# Disable CORS. Do not remove this for full-stack development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "")
DEVIN_API_TOKEN = os.environ.get("DEVIN_API_TOKEN", "")
DEFAULT_REPO = os.environ.get("DEFAULT_REPO", "duan-daniel/finserv-portal-demo")


@app.on_event("startup")
async def startup():
    await init_db()


@app.get("/healthz")
async def healthz():
    return {"status": "ok"}


# --- GitHub Issue Ingestion ---


class IngestRequest(BaseModel):
    repo: str | None = None
    per_page: int = 100
    state: str = "open"


@app.post("/api/issues/ingest")
async def ingest_issues(req: IngestRequest | None = None):
    """Pull issues from GitHub and store them locally."""
    repo = (req.repo if req else None) or DEFAULT_REPO
    per_page = req.per_page if req else 100
    state = req.state if req else "open"

    headers = {"Accept": "application/vnd.github+json"}
    if GITHUB_TOKEN:
        headers["Authorization"] = f"Bearer {GITHUB_TOKEN}"

    url = f"https://api.github.com/repos/{repo}/issues"
    params = {"state": state, "per_page": per_page, "sort": "created", "direction": "desc"}

    async with httpx.AsyncClient() as client:
        resp = await client.get(url, headers=headers, params=params)
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail=f"GitHub API error: {resp.text}")
        github_issues = resp.json()

    db = await get_db()
    imported = 0
    for issue in github_issues:
        if "pull_request" in issue:
            continue

        labels = json.dumps([l["name"] for l in issue.get("labels", [])])
        try:
            await db.execute(
                """INSERT OR REPLACE INTO issues
                   (issue_number, title, body, labels, state, created_at, html_url, repo)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    issue["number"],
                    issue["title"],
                    issue.get("body") or "",
                    labels,
                    issue["state"],
                    issue["created_at"],
                    issue.get("html_url", ""),
                    repo,
                ),
            )
            imported += 1

            label_list = [l["name"] for l in issue.get("labels", [])]
            triage_result = triage_issue(issue["title"], issue.get("body") or "", label_list)

            prompt = generate_prompt(
                issue["number"],
                issue["title"],
                issue.get("body") or "",
                repo,
                triage_result["issue_type"],
            )
            acceptance = generate_acceptance_criteria(
                issue["title"], issue.get("body") or "", triage_result["issue_type"]
            )

            await db.execute(
                """INSERT OR REPLACE INTO triage
                   (issue_number, issue_type, complexity, devin_fit, candidate_score,
                    recommendation, reasoning, generated_prompt, acceptance_criteria)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    issue["number"],
                    triage_result["issue_type"],
                    triage_result["complexity"],
                    triage_result["devin_fit"],
                    triage_result["candidate_score"],
                    triage_result["recommendation"],
                    triage_result["reasoning"],
                    prompt,
                    acceptance,
                ),
            )
        except Exception as e:
            print(f"Error importing issue #{issue.get('number')}: {e}")

    await db.commit()
    await db.close()

    return {"imported": imported, "repo": repo}


# --- Issues List ---


@app.get("/api/issues")
async def list_issues(
    recommendation: str | None = None,
    devin_fit: str | None = None,
    sort_by: str = "candidate_score",
    order: str = "desc",
):
    """List all imported issues with their triage data."""
    db = await get_db()

    query = """
        SELECT i.*, t.issue_type, t.complexity, t.devin_fit, t.candidate_score,
               t.recommendation, t.reasoning,
               s.session_id, s.status as session_status, s.latest_state,
               s.session_url, s.pr_url
        FROM issues i
        LEFT JOIN triage t ON i.issue_number = t.issue_number
        LEFT JOIN sessions s ON i.issue_number = s.issue_number
    """
    conditions: list[str] = []
    params: list[str] = []

    if recommendation:
        conditions.append("t.recommendation = ?")
        params.append(recommendation)
    if devin_fit:
        conditions.append("t.devin_fit = ?")
        params.append(devin_fit)

    if conditions:
        query += " WHERE " + " AND ".join(conditions)

    valid_sorts = {"candidate_score", "created_at", "issue_number", "title"}
    if sort_by not in valid_sorts:
        sort_by = "candidate_score"
    order_dir = "DESC" if order == "desc" else "ASC"
    if sort_by == "created_at":
        query += f" ORDER BY i.created_at {order_dir}"
    else:
        query += f" ORDER BY t.{sort_by} {order_dir}"

    cursor = await db.execute(query, params)
    rows = await cursor.fetchall()

    issues = []
    for row in rows:
        issue = dict(row)
        issue["labels"] = json.loads(issue.get("labels") or "[]")
        if issue.get("created_at"):
            try:
                created = datetime.fromisoformat(issue["created_at"].replace("Z", "+00:00"))
                age_days = (datetime.now(created.tzinfo) - created).days
                issue["age_days"] = age_days
            except Exception:
                issue["age_days"] = None
        issues.append(issue)

    await db.close()
    return {"issues": issues, "count": len(issues)}


# --- Issue Detail ---


@app.get("/api/issues/{issue_number}")
async def get_issue(issue_number: int):
    """Get detailed info for a single issue."""
    db = await get_db()

    cursor = await db.execute(
        """SELECT i.*, t.issue_type, t.complexity, t.devin_fit, t.candidate_score,
                  t.recommendation, t.reasoning, t.generated_prompt, t.acceptance_criteria,
                  s.session_id, s.status as session_status, s.latest_state,
                  s.session_url, s.pr_url, s.prompt as session_prompt
           FROM issues i
           LEFT JOIN triage t ON i.issue_number = t.issue_number
           LEFT JOIN sessions s ON i.issue_number = s.issue_number
           WHERE i.issue_number = ?""",
        (issue_number,),
    )
    row = await cursor.fetchone()
    await db.close()

    if not row:
        raise HTTPException(status_code=404, detail="Issue not found")

    issue = dict(row)
    issue["labels"] = json.loads(issue.get("labels") or "[]")

    if issue.get("created_at"):
        try:
            created = datetime.fromisoformat(issue["created_at"].replace("Z", "+00:00"))
            age_days = (datetime.now(created.tzinfo) - created).days
            issue["age_days"] = age_days
        except Exception:
            issue["age_days"] = None

    return issue


# --- Delegate to Devin ---


class DelegateRequest(BaseModel):
    issue_number: int
    playbook_id: str | None = None


@app.post("/api/delegate")
async def delegate_to_devin(req: DelegateRequest):
    """Launch a Devin session for a given issue."""
    db = await get_db()

    cursor = await db.execute(
        """SELECT i.*, t.issue_type, t.generated_prompt, t.recommendation
           FROM issues i
           LEFT JOIN triage t ON i.issue_number = t.issue_number
           WHERE i.issue_number = ?""",
        (req.issue_number,),
    )
    row = await cursor.fetchone()
    if not row:
        await db.close()
        raise HTTPException(status_code=404, detail="Issue not found")

    issue = dict(row)
    prompt = issue.get("generated_prompt") or ""
    repo = issue.get("repo") or DEFAULT_REPO

    if not prompt:
        prompt = generate_prompt(
            req.issue_number,
            issue["title"],
            issue.get("body") or "",
            repo,
            issue.get("issue_type") or "feature",
        )

    cursor = await db.execute(
        "SELECT session_id FROM sessions WHERE issue_number = ?",
        (req.issue_number,),
    )
    existing = await cursor.fetchone()
    if existing and existing["session_id"]:
        await db.close()
        raise HTTPException(status_code=409, detail="Issue already delegated")

    session_data = {
        "prompt": prompt,
        "title": f"Issue #{req.issue_number}: {issue['title']}",
        "tags": [f"issue-{req.issue_number}", "backlog-burner"],
    }
    if req.playbook_id:
        session_data["playbook_id"] = req.playbook_id

    session_id = None
    session_url = ""

    if DEVIN_API_TOKEN:
        api_headers = {
            "Authorization": f"Bearer {DEVIN_API_TOKEN}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient() as client:
            try:
                resp = await client.post(
                    "https://api.devin.ai/v1/sessions",
                    json=session_data,
                    headers=api_headers,
                    timeout=30.0,
                )
                if resp.status_code in (200, 201):
                    result = resp.json()
                    session_id = result.get("session_id", result.get("id", ""))
                    session_url = result.get("url", result.get("session_url", ""))
                    if session_id and not session_url:
                        session_url = f"https://app.devin.ai/sessions/{session_id}"
                else:
                    print(f"Devin API error: {resp.status_code} {resp.text}")
                    session_id = f"pending-{req.issue_number}"
                    session_url = ""
            except Exception as e:
                print(f"Devin API call failed: {e}")
                session_id = f"pending-{req.issue_number}"
                session_url = ""
    else:
        session_id = f"mock-{req.issue_number}"
        session_url = f"https://app.devin.ai/sessions/mock-{req.issue_number}"

    await db.execute(
        """INSERT OR REPLACE INTO sessions
           (issue_number, session_id, session_url, status, latest_state, prompt)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (req.issue_number, session_id, session_url, "active", "investigating", prompt),
    )
    await db.commit()
    await db.close()

    return {
        "issue_number": req.issue_number,
        "session_id": session_id,
        "session_url": session_url,
        "status": "active",
        "latest_state": "investigating",
    }


# --- Session Status ---


@app.get("/api/sessions")
async def list_sessions():
    """List all Devin sessions."""
    db = await get_db()
    cursor = await db.execute(
        """SELECT s.*, i.title as issue_title
           FROM sessions s
           LEFT JOIN issues i ON s.issue_number = i.issue_number
           ORDER BY s.created_at DESC"""
    )
    rows = await cursor.fetchall()
    await db.close()
    return {"sessions": [dict(r) for r in rows]}


@app.delete("/api/sessions")
async def clear_sessions():
    """Clear all sessions (useful after fixing config issues)."""
    db = await get_db()
    cursor = await db.execute("SELECT COUNT(*) as count FROM sessions")
    count = (await cursor.fetchone())["count"]
    await db.execute("DELETE FROM sessions")
    await db.commit()
    await db.close()
    return {"cleared": count}


@app.get("/api/config")
async def get_config():
    """Check backend configuration status (no secrets exposed)."""
    return {
        "devin_api_configured": bool(DEVIN_API_TOKEN),
        "github_token_configured": bool(GITHUB_TOKEN),
        "default_repo": DEFAULT_REPO,
    }


@app.post("/api/sessions/refresh")
async def refresh_sessions():
    """Refresh session statuses from Devin API."""
    if not DEVIN_API_TOKEN:
        return {"refreshed": 0, "message": "No Devin API token configured"}

    db = await get_db()
    cursor = await db.execute(
        "SELECT * FROM sessions WHERE status != 'done' AND session_id NOT LIKE 'mock-%' AND session_id NOT LIKE 'pending-%'"
    )
    rows = await cursor.fetchall()
    refreshed = 0

    api_headers = {
        "Authorization": f"Bearer {DEVIN_API_TOKEN}",
    }

    async with httpx.AsyncClient() as client:
        for row in rows:
            session = dict(row)
            try:
                resp = await client.get(
                    f"https://api.devin.ai/v1/sessions/{session['session_id']}",
                    headers=api_headers,
                    timeout=15.0,
                )
                if resp.status_code == 200:
                    data = resp.json()
                    status = data.get("status", session["status"])
                    pr_url = ""

                    pull_request = data.get("pull_request")
                    if pull_request:
                        pr_url = pull_request.get("url", pull_request.get("html_url", ""))

                    status_map = {
                        "running": "coding",
                        "blocked": "needs_input",
                        "finished": "done",
                        "stopped": "done",
                        "error": "needs_input",
                    }
                    latest_state = status_map.get(status, status)

                    await db.execute(
                        """UPDATE sessions
                           SET status = ?, latest_state = ?, pr_url = ?, updated_at = datetime('now')
                           WHERE session_id = ?""",
                        (status, latest_state, pr_url or session.get("pr_url", ""), session["session_id"]),
                    )
                    refreshed += 1
            except Exception as e:
                print(f"Error refreshing session {session['session_id']}: {e}")

    await db.commit()
    await db.close()
    return {"refreshed": refreshed}


# --- Overview / Digest ---


@app.get("/api/overview")
async def get_overview():
    """Manager dashboard summary."""
    db = await get_db()

    cursor = await db.execute("SELECT COUNT(*) as count FROM issues")
    total_issues = (await cursor.fetchone())["count"]

    cursor = await db.execute(
        "SELECT recommendation, COUNT(*) as count FROM triage GROUP BY recommendation"
    )
    rec_rows = await cursor.fetchall()
    by_recommendation = {r["recommendation"]: r["count"] for r in rec_rows}

    cursor = await db.execute(
        "SELECT devin_fit, COUNT(*) as count FROM triage GROUP BY devin_fit"
    )
    fit_rows = await cursor.fetchall()
    by_devin_fit = {r["devin_fit"]: r["count"] for r in fit_rows}

    cursor = await db.execute(
        "SELECT issue_type, COUNT(*) as count FROM triage GROUP BY issue_type"
    )
    type_rows = await cursor.fetchall()
    by_issue_type = {r["issue_type"]: r["count"] for r in type_rows}

    cursor = await db.execute("SELECT COUNT(*) as count FROM sessions")
    total_sessions = (await cursor.fetchone())["count"]

    cursor = await db.execute(
        "SELECT latest_state, COUNT(*) as count FROM sessions GROUP BY latest_state"
    )
    state_rows = await cursor.fetchall()
    by_state = {r["latest_state"]: r["count"] for r in state_rows}

    cursor = await db.execute(
        "SELECT COUNT(*) as count FROM sessions WHERE pr_url != '' AND pr_url IS NOT NULL"
    )
    prs_opened = (await cursor.fetchone())["count"]

    cursor = await db.execute(
        "SELECT COUNT(*) as count FROM sessions WHERE latest_state = 'needs_input'"
    )
    blocked = (await cursor.fetchone())["count"]

    await db.close()

    return {
        "total_issues": total_issues,
        "recommended_for_delegation": by_recommendation.get("recommended", 0),
        "maybe_delegate": by_recommendation.get("maybe", 0),
        "dont_delegate": by_recommendation.get("dont_delegate", 0),
        "sessions_launched": total_sessions,
        "prs_opened": prs_opened,
        "blocked": blocked,
        "by_devin_fit": by_devin_fit,
        "by_issue_type": by_issue_type,
        "by_state": by_state,
        "by_recommendation": by_recommendation,
    }
