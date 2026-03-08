import { useEffect, useState, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Download,
  RefreshCw,
  ExternalLink,
  Rocket,
  ChevronRight,
  Filter,
  GitPullRequest,
  GitMerge,
  XCircle,
} from "lucide-react";
import { getIssues, ingestIssues, delegateToDevin, refreshSessions, DEFAULT_REPO, type Issue } from "../lib/api";

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-gray-600">—</span>;
  let color = "bg-red-500/10 text-red-400 border-red-500/20";
  if (score >= 4) color = "bg-green-500/10 text-green-400 border-green-500/20";
  else if (score >= 1) color = "bg-yellow-500/10 text-yellow-400 border-yellow-500/20";
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium tabular-nums ${color}`}>
      {score}
    </span>
  );
}

function FitBadge({ fit }: { fit: string | null }) {
  if (!fit) return <span className="text-gray-600">—</span>;
  const map: Record<string, string> = {
    yes: "bg-green-500/10 text-green-400 border-green-500/20",
    maybe: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    no: "bg-red-500/10 text-red-400 border-red-500/20",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${map[fit] || "bg-gray-800 text-gray-400 border-gray-700"}`}>
      {fit}
    </span>
  );
}

function TypeBadge({ type }: { type: string | null }) {
  if (!type) return null;
  const map: Record<string, string> = {
    bug: "bg-red-500/10 text-red-400 border-red-500/20",
    feature: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    docs: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    refactor: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${map[type] || "bg-gray-800 text-gray-400 border-gray-700"}`}>
      {type}
    </span>
  );
}

function StatusBadge({ state }: { state: string | null }) {
  if (!state) return null;
  const map: Record<string, string> = {
    investigating: "bg-blue-500/10 text-blue-400",
    coding: "bg-purple-500/10 text-purple-400",
    needs_input: "bg-yellow-500/10 text-yellow-400",
    done: "bg-green-500/10 text-green-400",
    pending: "bg-gray-800 text-gray-400",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${map[state] || "bg-gray-800 text-gray-400"}`}>
      {state.replace("_", " ")}
    </span>
  );
}

export default function IssuesPage() {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [ingesting, setIngesting] = useState(false);
  const [delegatingId, setDelegatingId] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const didAutoRefresh = useRef(false);
  const [repo, setRepo] = useState(DEFAULT_REPO);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const filterParam = searchParams.get("filter") || "all";

  const load = async () => {
    setLoading(true);
    try {
      const params: { recommendation?: string } = {};
      if (filterParam !== "all") {
        params.recommendation = filterParam;
      }
      const data = await getIssues(params);
      setIssues(data.issues);
    } catch (e) {
      console.error("Failed to load issues", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [filterParam]);

  const handleIngest = async () => {
    setIngesting(true);
    try {
      await ingestIssues(repo);
      await load();
    } catch (e) {
      console.error("Ingest failed", e);
    } finally {
      setIngesting(false);
    }
  };

  const handleDelegate = async (issueNumber: number) => {
    setDelegatingId(issueNumber);
    try {
      await delegateToDevin(issueNumber);
      await load();
    } catch (e) {
      console.error("Delegate failed", e);
      alert(`Failed to delegate: ${e}`);
    } finally {
      setDelegatingId(null);
    }
  };

  const handleRefreshSessions = async () => {
    setRefreshing(true);
    try {
      await refreshSessions();
      await load();
    } catch (e) {
      console.error("Refresh sessions failed", e);
    } finally {
      setRefreshing(false);
    }
  };

  // Auto-refresh sessions once on page load if any issues have sessions
  useEffect(() => {
    if (!loading && issues.length > 0 && !didAutoRefresh.current) {
      const hasSessions = issues.some((i) => i.session_id);
      if (hasSessions) {
        didAutoRefresh.current = true;
        (async () => {
          try {
            await refreshSessions();
            const resp = await getIssues(filterParam !== "all" ? { recommendation: filterParam } : undefined);
            setIssues(resp.issues);
          } catch (e) {
            console.error("Auto-refresh failed", e);
          }
        })();
      }
    }
  }, [loading, issues.length]);

  const filters = [
    { label: "All", value: "all" },
    { label: "Recommended", value: "recommended" },
    { label: "Maybe", value: "maybe" },
    { label: "Don't delegate", value: "dont_delegate" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Issue Inbox</h1>
          <p className="text-gray-400 mt-1">{issues.length} issues</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
            placeholder="owner/repo"
            className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:border-orange-500 focus:outline-none w-64"
          />
          <button
            onClick={handleIngest}
            disabled={ingesting}
            className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-500 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            {ingesting ? "Syncing..." : "Sync Issues"}
          </button>
          <button
            onClick={handleRefreshSessions}
            disabled={refreshing}
            title="Refresh session statuses"
            className="inline-flex items-center gap-2 rounded-lg border border-gray-700 px-3 py-2 text-sm text-gray-300 hover:bg-gray-800 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-gray-500" />
        {filters.map((f) => (
          <button
            key={f.value}
            onClick={() => {
              if (f.value === "all") {
                setSearchParams({});
              } else {
                setSearchParams({ filter: f.value });
              }
            }}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filterParam === f.value
                ? "bg-orange-500/10 text-orange-400 border border-orange-500/20"
                : "border border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-600"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <RefreshCw className="h-6 w-6 animate-spin text-orange-500" />
        </div>
      ) : issues.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p>No issues found. Click "Sync Issues" to import from GitHub.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-900/50">
                <th className="text-left px-4 py-3 font-medium text-gray-400">#</th>
                <th className="text-left px-4 py-3 font-medium text-gray-400">Title</th>
                <th className="text-left px-4 py-3 font-medium text-gray-400">Labels</th>
                <th className="text-left px-4 py-3 font-medium text-gray-400">Type</th>
                <th className="text-left px-4 py-3 font-medium text-gray-400">Age</th>
                <th className="text-center px-4 py-3 font-medium text-gray-400">Score</th>
                <th className="text-center px-4 py-3 font-medium text-gray-400">Devin Fit</th>
                <th className="text-center px-4 py-3 font-medium text-gray-400">Status</th>
                <th className="text-right px-4 py-3 font-medium text-gray-400">Action</th>
              </tr>
            </thead>
            <tbody>
              {issues.map((issue) => (
                <tr
                  key={issue.issue_number}
                  className="border-b border-gray-800/50 hover:bg-gray-900/30 transition-colors cursor-pointer"
                  onClick={() => navigate(`/issues/${issue.issue_number}`)}
                >
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                    #{issue.issue_number}
                  </td>
                  <td className="px-4 py-3 max-w-xs">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium text-gray-200">{issue.title}</span>
                      {issue.html_url && (
                        <a
                          href={issue.html_url}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="flex-shrink-0 text-gray-600 hover:text-gray-400"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {issue.labels.slice(0, 3).map((label) => (
                        <span
                          key={label}
                          className="inline-flex items-center rounded-full bg-gray-800 border border-gray-700 px-2 py-0.5 text-xs text-gray-300"
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <TypeBadge type={issue.issue_type} />
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                    {issue.age_days !== null ? `${issue.age_days}d` : "—"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <ScoreBadge score={issue.candidate_score} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <FitBadge fit={issue.devin_fit} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    {issue.session_id ? (
                      <div className="flex items-center justify-center gap-1.5">
                        <StatusBadge state={issue.latest_state} />
                        {issue.pr_url && (
                          <a
                            href={issue.pr_url}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            title={issue.pr_status ? `PR ${issue.pr_status}` : "View PR"}
                            className="flex items-center"
                          >
                            {issue.pr_status === "merged" ? (
                              <GitMerge className="h-3.5 w-3.5 text-purple-400" />
                            ) : issue.pr_status === "closed" ? (
                              <XCircle className="h-3.5 w-3.5 text-red-400" />
                            ) : (
                              <GitPullRequest className="h-3.5 w-3.5 text-green-400" />
                            )}
                          </a>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-600">not delegated</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    {!issue.session_id ? (
                      <button
                        onClick={() => handleDelegate(issue.issue_number)}
                        disabled={delegatingId === issue.issue_number}
                        className="inline-flex items-center gap-1 rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-500 disabled:opacity-50 transition-colors"
                      >
                        <Rocket className="h-3 w-3" />
                        {delegatingId === issue.issue_number ? "..." : "Delegate"}
                      </button>
                    ) : (
                      <ChevronRight className="h-4 w-4 text-gray-600 ml-auto" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
