import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Inbox,
  ThumbsUp,
  HelpCircle,
  XCircle,
  Rocket,
  GitPullRequest,
  AlertTriangle,
  RefreshCw,
  Download,
} from "lucide-react";
import { getOverview, ingestIssues, DEFAULT_REPO, type Overview } from "../lib/api";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

const COLORS = ["#f97316", "#3b82f6", "#a855f7", "#22c55e", "#eab308", "#ef4444"];

function StatCard({
  icon,
  label,
  value,
  color,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-start gap-2 rounded-xl border border-gray-800 bg-gray-900 p-5 transition-all hover:border-gray-700 hover:bg-gray-900/80 ${onClick ? "cursor-pointer" : "cursor-default"}`}
    >
      <div className={`rounded-lg p-2 ${color}`}>{icon}</div>
      <div className="text-3xl font-bold tabular-nums">{value}</div>
      <div className="text-sm text-gray-400">{label}</div>
    </button>
  );
}

export default function OverviewPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [ingesting, setIngesting] = useState(false);
  const [repo, setRepo] = useState(DEFAULT_REPO);
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    try {
      const data = await getOverview();
      setOverview(data);
    } catch (e) {
      console.error("Failed to load overview", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-orange-500" />
      </div>
    );
  }

  if (!overview) {
    return (
      <div className="text-center py-16">
        <h2 className="text-xl font-semibold mb-4">No data yet</h2>
        <p className="text-gray-400 mb-6">Import issues from GitHub to get started.</p>
        <button
          onClick={handleIngest}
          disabled={ingesting}
          className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-500 disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          {ingesting ? "Importing..." : "Import Issues"}
        </button>
      </div>
    );
  }

  const issueTypePieData = Object.entries(overview.by_issue_type).map(([name, value]) => ({
    name,
    value,
  }));

  const recommendationPieData = Object.entries(overview.by_recommendation).map(([name, value]) => ({
    name: name === "recommended" ? "Recommended" : name === "maybe" ? "Maybe" : "Don't delegate",
    value,
  }));

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Manager Dashboard</h1>
          <p className="text-gray-400 mt-1">Backlog triage at a glance</p>
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
            {ingesting ? "Importing..." : "Sync Issues"}
          </button>
          <button
            onClick={load}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-700 px-4 py-2 text-sm font-medium text-gray-300 hover:bg-gray-800"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Digest card */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
        <h2 className="text-lg font-semibold mb-4">Digest</h2>
        <ul className="space-y-2 text-sm">
          <li className="flex items-center gap-2 text-gray-300">
            <span className="font-mono text-orange-400 w-6 text-right">{overview.total_issues}</span>
            issues imported
          </li>
          <li className="flex items-center gap-2 text-gray-300">
            <span className="font-mono text-green-400 w-6 text-right">{overview.recommended_for_delegation}</span>
            recommended for delegation
          </li>
          <li className="flex items-center gap-2 text-gray-300">
            <span className="font-mono text-blue-400 w-6 text-right">{overview.sessions_launched}</span>
            sessions launched
          </li>
          <li className="flex items-center gap-2 text-gray-300">
            <span className="font-mono text-purple-400 w-6 text-right">{overview.prs_opened}</span>
            PRs opened
          </li>
          {overview.blocked > 0 && (
            <li className="flex items-center gap-2 text-yellow-400">
              <span className="font-mono w-6 text-right">{overview.blocked}</span>
              blocked (needs input)
            </li>
          )}
        </ul>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        <StatCard
          icon={<Inbox className="h-5 w-5 text-orange-400" />}
          label="Total Issues"
          value={overview.total_issues}
          color="bg-orange-500/10"
          onClick={() => navigate("/issues")}
        />
        <StatCard
          icon={<ThumbsUp className="h-5 w-5 text-green-400" />}
          label="Recommended"
          value={overview.recommended_for_delegation}
          color="bg-green-500/10"
          onClick={() => navigate("/issues?filter=recommended")}
        />
        <StatCard
          icon={<HelpCircle className="h-5 w-5 text-blue-400" />}
          label="Maybe"
          value={overview.maybe_delegate}
          color="bg-blue-500/10"
          onClick={() => navigate("/issues?filter=maybe")}
        />
        <StatCard
          icon={<XCircle className="h-5 w-5 text-red-400" />}
          label="Don't Delegate"
          value={overview.dont_delegate}
          color="bg-red-500/10"
          onClick={() => navigate("/issues?filter=dont_delegate")}
        />
        <StatCard
          icon={<Rocket className="h-5 w-5 text-purple-400" />}
          label="Sessions"
          value={overview.sessions_launched}
          color="bg-purple-500/10"
        />
        <StatCard
          icon={<GitPullRequest className="h-5 w-5 text-cyan-400" />}
          label="PRs Opened"
          value={overview.prs_opened}
          color="bg-cyan-500/10"
        />
        <StatCard
          icon={<AlertTriangle className="h-5 w-5 text-yellow-400" />}
          label="Blocked"
          value={overview.blocked}
          color="bg-yellow-500/10"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {issueTypePieData.length > 0 && (
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">By Issue Type</h3>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={issueTypePieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                    label={({ name, value }) => `${name} (${value})`}
                  >
                    {issueTypePieData.map((_, idx) => (
                      <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: 8 }}
                    labelStyle={{ color: "#f3f4f6" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
        {recommendationPieData.length > 0 && (
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">By Recommendation</h3>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={recommendationPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                    label={({ name, value }) => `${name} (${value})`}
                  >
                    {recommendationPieData.map((_, idx) => (
                      <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: 8 }}
                    labelStyle={{ color: "#f3f4f6" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
