import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ExternalLink,
  Rocket,
  RefreshCw,
  GitPullRequest,
  Clock,
  Tag,
  FileText,
  Zap,
} from "lucide-react";
import { getIssue, delegateToDevin, type Issue } from "../lib/api";

function Badge({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${className}`}>
      {children}
    </span>
  );
}

export default function IssueDetailPage() {
  const { issueNumber } = useParams<{ issueNumber: string }>();
  const navigate = useNavigate();
  const [issue, setIssue] = useState<Issue | null>(null);
  const [loading, setLoading] = useState(true);
  const [delegating, setDelegating] = useState(false);

  const load = async () => {
    if (!issueNumber) return;
    setLoading(true);
    try {
      const data = await getIssue(Number(issueNumber));
      setIssue(data);
    } catch (e) {
      console.error("Failed to load issue", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [issueNumber]);

  const handleDelegate = async () => {
    if (!issue) return;
    setDelegating(true);
    try {
      await delegateToDevin(issue.issue_number);
      await load();
    } catch (e) {
      console.error("Delegate failed", e);
      alert(`Failed to delegate: ${e}`);
    } finally {
      setDelegating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-orange-500" />
      </div>
    );
  }

  if (!issue) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-400">Issue not found</p>
        <button onClick={() => navigate("/issues")} className="mt-4 text-orange-400 hover:underline">
          Back to issues
        </button>
      </div>
    );
  }

  const fitColor: Record<string, string> = {
    yes: "bg-green-500/10 text-green-400 border-green-500/20",
    maybe: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    no: "bg-red-500/10 text-red-400 border-red-500/20",
  };

  const typeColor: Record<string, string> = {
    bug: "bg-red-500/10 text-red-400 border-red-500/20",
    feature: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    docs: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    refactor: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  };

  const complexityColor: Record<string, string> = {
    easy: "bg-green-500/10 text-green-400 border-green-500/20",
    medium: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    risky: "bg-red-500/10 text-red-400 border-red-500/20",
  };

  const stateColor: Record<string, string> = {
    investigating: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    coding: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    needs_input: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    done: "bg-green-500/10 text-green-400 border-green-500/20",
    pending: "bg-gray-800 text-gray-400 border-gray-700",
  };

  return (
    <div className="space-y-6">
      {/* Back button + header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <button
            onClick={() => navigate("/issues")}
            className="mt-1 rounded-lg p-1.5 text-gray-400 hover:bg-gray-800 hover:text-gray-200 transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-gray-500 font-mono text-sm">#{issue.issue_number}</span>
              {issue.html_url && (
                <a
                  href={issue.html_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-gray-500 hover:text-gray-300"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
            <h1 className="text-xl font-bold mt-1">{issue.title}</h1>
          </div>
        </div>
        {!issue.session_id && (
          <button
            onClick={handleDelegate}
            disabled={delegating}
            className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-500 disabled:opacity-50 flex-shrink-0"
          >
            <Rocket className="h-4 w-4" />
            {delegating ? "Delegating..." : "Delegate to Devin"}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column - Issue details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Issue description */}
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Issue Description
            </h2>
            <div className="prose prose-invert prose-sm max-w-none">
              <pre className="whitespace-pre-wrap text-sm text-gray-300 font-sans leading-relaxed">
                {issue.body || "No description provided."}
              </pre>
            </div>
          </div>

          {/* Generated Devin brief */}
          {issue.generated_prompt && (
            <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-6">
              <h2 className="text-sm font-semibold text-orange-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Zap className="h-4 w-4" />
                Generated Devin Brief
              </h2>
              <pre className="whitespace-pre-wrap text-sm text-gray-300 font-mono leading-relaxed bg-gray-900/50 rounded-lg p-4 border border-gray-800">
                {issue.generated_prompt}
              </pre>
            </div>
          )}
        </div>

        {/* Right column - Triage & session info */}
        <div className="space-y-6">
          {/* Triage summary */}
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 space-y-4">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
              <Tag className="h-4 w-4" />
              Triage Summary
            </h2>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">Issue Type</span>
                {issue.issue_type && (
                  <Badge className={typeColor[issue.issue_type] || "bg-gray-800 text-gray-400 border-gray-700"}>
                    {issue.issue_type}
                  </Badge>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">Complexity</span>
                {issue.complexity && (
                  <Badge className={complexityColor[issue.complexity] || "bg-gray-800 text-gray-400 border-gray-700"}>
                    {issue.complexity}
                  </Badge>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">Devin Fit</span>
                {issue.devin_fit && (
                  <Badge className={fitColor[issue.devin_fit] || "bg-gray-800 text-gray-400 border-gray-700"}>
                    {issue.devin_fit}
                  </Badge>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">Score</span>
                <span className="text-lg font-bold tabular-nums text-orange-400">
                  {issue.candidate_score ?? "—"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">Recommendation</span>
                <Badge
                  className={
                    issue.recommendation === "recommended"
                      ? "bg-green-500/10 text-green-400 border-green-500/20"
                      : issue.recommendation === "maybe"
                      ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"
                      : "bg-red-500/10 text-red-400 border-red-500/20"
                  }
                >
                  {issue.recommendation?.replace("_", " ") || "—"}
                </Badge>
              </div>
            </div>

            {issue.reasoning && (
              <div className="pt-3 border-t border-gray-800">
                <span className="text-xs text-gray-500 uppercase tracking-wider">Reasoning</span>
                <p className="mt-1 text-sm text-gray-300">{issue.reasoning}</p>
              </div>
            )}
          </div>

          {/* Labels */}
          {issue.labels.length > 0 && (
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Labels</h2>
              <div className="flex flex-wrap gap-2">
                {issue.labels.map((label) => (
                  <span
                    key={label}
                    className="inline-flex items-center rounded-full bg-gray-800 border border-gray-700 px-2.5 py-0.5 text-xs text-gray-300"
                  >
                    {label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Metadata */}
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 space-y-3">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Metadata
            </h2>
            <div className="text-sm space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-500">Age</span>
                <span className="text-gray-300">{issue.age_days !== null ? `${issue.age_days} days` : "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">State</span>
                <span className="text-gray-300">{issue.state}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Repo</span>
                <span className="text-gray-300 font-mono text-xs">{issue.repo}</span>
              </div>
            </div>
          </div>

          {/* Session status */}
          {issue.session_id && (
            <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-6 space-y-4">
              <h2 className="text-sm font-semibold text-purple-400 uppercase tracking-wider flex items-center gap-2">
                <Rocket className="h-4 w-4" />
                Devin Session
              </h2>
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Status</span>
                  <Badge className={stateColor[issue.latest_state || "pending"] || "bg-gray-800 text-gray-400 border-gray-700"}>
                    {(issue.latest_state || "pending").replace("_", " ")}
                  </Badge>
                </div>
                {issue.session_url && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Session</span>
                    <a
                      href={issue.session_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-purple-400 hover:underline flex items-center gap-1"
                    >
                      Open <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}
                {issue.pr_url && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">PR</span>
                    <a
                      href={issue.pr_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-green-400 hover:underline flex items-center gap-1"
                    >
                      <GitPullRequest className="h-3 w-3" />
                      View PR <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
