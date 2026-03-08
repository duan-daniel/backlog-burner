const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export const DEFAULT_REPO = import.meta.env.VITE_DEFAULT_REPO || "duan-daniel/finserv-portal-demo";

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const resp = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!resp.ok) {
    const error = await resp.text();
    throw new Error(`API error ${resp.status}: ${error}`);
  }
  return resp.json();
}

export interface Issue {
  id: number;
  issue_number: number;
  title: string;
  body: string;
  labels: string[];
  state: string;
  created_at: string;
  html_url: string;
  repo: string;
  imported_at: string;
  issue_type: string | null;
  complexity: string | null;
  devin_fit: string | null;
  candidate_score: number | null;
  recommendation: string | null;
  reasoning: string | null;
  generated_prompt?: string | null;
  acceptance_criteria?: string | null;
  session_id: string | null;
  session_status: string | null;
  latest_state: string | null;
  session_url: string | null;
  pr_url: string | null;
  pr_status: string | null;
  session_prompt?: string | null;
  age_days: number | null;
}

export interface Overview {
  total_issues: number;
  recommended_for_delegation: number;
  maybe_delegate: number;
  dont_delegate: number;
  sessions_launched: number;
  prs_opened: number;
  blocked: number;
  by_devin_fit: Record<string, number>;
  by_issue_type: Record<string, number>;
  by_state: Record<string, number>;
  by_recommendation: Record<string, number>;
}

export interface Session {
  id: number;
  issue_number: number;
  session_id: string;
  session_url: string;
  pr_url: string;
  status: string;
  latest_state: string;
  prompt: string;
  created_at: string;
  updated_at: string;
  issue_title: string;
}

export async function ingestIssues(repo?: string) {
  return fetchApi<{ imported: number; repo: string }>("/api/issues/ingest", {
    method: "POST",
    body: JSON.stringify({ repo }),
  });
}

export async function getIssues(params?: {
  recommendation?: string;
  devin_fit?: string;
  sort_by?: string;
  order?: string;
}) {
  const searchParams = new URLSearchParams();
  if (params?.recommendation) searchParams.set("recommendation", params.recommendation);
  if (params?.devin_fit) searchParams.set("devin_fit", params.devin_fit);
  if (params?.sort_by) searchParams.set("sort_by", params.sort_by);
  if (params?.order) searchParams.set("order", params.order);
  const qs = searchParams.toString();
  return fetchApi<{ issues: Issue[]; count: number }>(`/api/issues${qs ? `?${qs}` : ""}`);
}

export async function getIssue(issueNumber: number) {
  return fetchApi<Issue>(`/api/issues/${issueNumber}`);
}

export async function delegateToDevin(issueNumber: number, playbookId?: string) {
  return fetchApi<{
    issue_number: number;
    session_id: string;
    session_url: string;
    status: string;
    latest_state: string;
  }>("/api/delegate", {
    method: "POST",
    body: JSON.stringify({ issue_number: issueNumber, playbook_id: playbookId }),
  });
}

export async function getSessions() {
  return fetchApi<{ sessions: Session[] }>("/api/sessions");
}

export async function refreshSessions() {
  return fetchApi<{ refreshed: number }>("/api/sessions/refresh", { method: "POST" });
}

export async function getOverview() {
  return fetchApi<Overview>("/api/overview");
}
