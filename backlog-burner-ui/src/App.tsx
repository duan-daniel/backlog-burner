import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import { Flame, LayoutDashboard, List } from "lucide-react";
import IssuesPage from "./pages/IssuesPage";
import IssueDetailPage from "./pages/IssueDetailPage";
import OverviewPage from "./pages/OverviewPage";

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-950 text-gray-100">
        {/* Nav */}
        <nav className="border-b border-gray-800 bg-gray-900/80 backdrop-blur sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex h-14 items-center justify-between">
              <div className="flex items-center gap-2">
                <Flame className="h-6 w-6 text-orange-500" />
                <span className="text-lg font-bold tracking-tight">Backlog Burner</span>
              </div>
              <div className="flex items-center gap-1">
                <NavLink
                  to="/"
                  end
                  className={({ isActive }) =>
                    `flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-orange-500/10 text-orange-400"
                        : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"
                    }`
                  }
                >
                  <LayoutDashboard className="h-4 w-4" />
                  Overview
                </NavLink>
                <NavLink
                  to="/issues"
                  className={({ isActive }) =>
                    `flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-orange-500/10 text-orange-400"
                        : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"
                    }`
                  }
                >
                  <List className="h-4 w-4" />
                  Issues
                </NavLink>
              </div>
            </div>
          </div>
        </nav>

        {/* Content */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Routes>
            <Route path="/" element={<OverviewPage />} />
            <Route path="/issues" element={<IssuesPage />} />
            <Route path="/issues/:issueNumber" element={<IssueDetailPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App
