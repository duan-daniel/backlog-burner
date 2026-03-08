"""Auto-triage scoring logic for GitHub issues.

Uses a configurable signal-based scoring system. Each signal checks a specific
aspect of the issue (labels, body content, structure) and contributes a weighted
score. Signals are data-driven -- adding new signals requires no code changes,
just adding entries to LABEL_SIGNALS / BODY_SIGNALS.
"""

import re

# ---------------------------------------------------------------------------
# Configurable scoring signals
# ---------------------------------------------------------------------------

LABEL_SIGNALS: list[dict] = [
    {
        "name": "label_actionable",
        "weight": 3,
        "patterns": [
            "bug", "fix", "bugfix", "defect",
            "docs", "documentation", "doc", "typo",
        ],
        "description": "Label suggests a well-scoped, actionable task",
    },
    {
        "name": "label_beginner_friendly",
        "weight": 2,
        "patterns": [
            "good first issue", "good-first-issue",
            "beginner", "easy", "starter", "help wanted",
        ],
        "description": "Label suggests low complexity / newcomer-friendly",
    },
    {
        "name": "label_risky",
        "weight": -3,
        "patterns": [
            "risky", "breaking-change", "breaking",
            "security", "critical", "complex",
        ],
        "description": "Label suggests high-risk change",
    },
]

BODY_SIGNALS: list[dict] = [
    {
        "name": "body_has_repro_steps",
        "weight": 2,
        "patterns": [
            "steps to reproduce", "repro", "how to reproduce",
            "reproduction", "to reproduce",
        ],
        "description": "Body contains reproduction steps",
    },
    {
        "name": "body_has_acceptance_criteria",
        "weight": 1,
        "patterns": [
            "acceptance criteria", "expected behavior",
            "expected result", "definition of done",
        ],
        "description": "Body has clear acceptance criteria",
    },
    {
        "name": "body_has_structure",
        "weight": 1,
        "patterns": ["### ", "## "],
        "description": "Body uses structured markdown sections",
    },
    {
        "name": "body_vague_scope",
        "weight": -2,
        "patterns": [
            "redesign", "architecture", "large refactor",
            "rewrite", "rethink", "overhaul", "migration",
        ],
        "description": "Suggests broad/vague scope",
    },
]

# File reference detection
FILE_REFERENCE_PATTERN = r'[\w/-]+\.(tsx?|jsx?|py|css|html|json|yaml|yml|md|go|rs|rb|java|kt|swift|c|cpp|h)'
FILE_REFERENCE_MAX = 4
FILE_REFERENCE_WEIGHT = 2

# Underspecified penalty config
UNDERSPECIFIED_WEIGHT = -2
CRITERIA_PATTERNS = [
    "acceptance criteria", "expected behavior",
    "expected result", "definition of done",
]
REPRO_PATTERNS = [
    "steps to reproduce", "repro", "how to reproduce",
    "reproduction", "to reproduce",
]
STRUCTURE_PATTERNS = ["### ", "## "]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _match_any_pattern(text: str, patterns: list[str]) -> bool:
    """Return True if any pattern appears in text (case-insensitive)."""
    text_lower = text.lower()
    return any(p.lower() in text_lower for p in patterns)


def _check_labels(labels: list[str], patterns: list[str]) -> bool:
    """Return True if any label matches any pattern (case-insensitive)."""
    labels_lower = [l.lower() for l in labels]
    return any(p.lower() in labels_lower for p in patterns)


# ---------------------------------------------------------------------------
# Core scoring
# ---------------------------------------------------------------------------


def compute_candidate_score(title: str, body: str, labels: list[str]) -> tuple[int, str]:
    """
    Compute a Devin candidate score using configurable signal matching.
    Returns (score, reasoning_string).
    """
    score = 0
    reasons: list[str] = []

    # --- Label signals ---
    for signal in LABEL_SIGNALS:
        if _check_labels(labels, signal["patterns"]):
            w = signal["weight"]
            score += w
            sign = "+" if w > 0 else ""
            reasons.append(f"{signal['description']} ({sign}{w})")

    # --- Body content signals ---
    for signal in BODY_SIGNALS:
        if _match_any_pattern(body, signal["patterns"]):
            w = signal["weight"]
            score += w
            sign = "+" if w > 0 else ""
            reasons.append(f"{signal['description']} ({sign}{w})")

    # --- File reference signal ---
    file_matches = re.findall(FILE_REFERENCE_PATTERN, body)
    if 1 <= len(file_matches) <= FILE_REFERENCE_MAX:
        score += FILE_REFERENCE_WEIGHT
        reasons.append(
            f"References {len(file_matches)} file(s) — scoped change (+{FILE_REFERENCE_WEIGHT})"
        )

    # --- Underspecified penalty ---
    has_criteria = _match_any_pattern(body, CRITERIA_PATTERNS)
    has_repro = _match_any_pattern(body, REPRO_PATTERNS)
    has_structure = _match_any_pattern(body, STRUCTURE_PATTERNS)
    if not has_criteria and not has_repro and not has_structure:
        score += UNDERSPECIFIED_WEIGHT
        reasons.append(f"No acceptance criteria, repro steps, or structure ({UNDERSPECIFIED_WEIGHT})")

    reasoning = "; ".join(reasons) if reasons else "no strong signals"
    return score, reasoning


# ---------------------------------------------------------------------------
# Classification helpers
# ---------------------------------------------------------------------------


def classify_issue_type(title: str, body: str, labels: list[str]) -> str:
    """Classify issue as bug / feature / docs / refactor."""
    title_lower = title.lower()
    labels_lower = [l.lower() for l in labels]

    if any(l in labels_lower for l in ["bug", "fix", "bugfix", "defect"]):
        return "bug"
    if any(l in labels_lower for l in ["documentation", "docs", "doc"]):
        return "docs"
    if any(l in labels_lower for l in ["refactor", "refactoring", "tech-debt", "cleanup"]):
        return "refactor"
    if any(l in labels_lower for l in ["feature", "enhancement", "feature-request"]):
        return "feature"

    if "bug" in title_lower or "fix" in title_lower or "broken" in title_lower or "error" in title_lower:
        return "bug"
    if "doc" in title_lower or "readme" in title_lower:
        return "docs"
    if "refactor" in title_lower or "cleanup" in title_lower:
        return "refactor"

    return "feature"


def estimate_complexity(title: str, body: str, labels: list[str]) -> str:
    """Estimate complexity: easy / medium / risky."""
    labels_lower = [l.lower() for l in labels]
    body_lower = body.lower()

    if any(l in labels_lower for l in ["risky", "complex", "breaking-change", "architecture"]):
        return "risky"
    if any(l in labels_lower for l in ["good first issue", "good-first-issue", "easy", "beginner"]):
        return "easy"

    risky_keywords = ["redesign", "architecture", "migration", "large refactor", "breaking change", "rewrite"]
    if any(k in body_lower for k in risky_keywords):
        return "risky"

    easy_keywords = ["typo", "small", "minor", "simple", "one-liner", "quick fix"]
    if any(k in body_lower for k in easy_keywords):
        return "easy"

    if len(body) > 2000:
        return "medium"

    return "medium"


def determine_devin_fit(score: int) -> str:
    """Map score to devin fit."""
    if score >= 4:
        return "yes"
    elif score >= 1:
        return "maybe"
    else:
        return "no"


def determine_recommendation(score: int) -> str:
    """Map score to recommendation."""
    if score >= 4:
        return "recommended"
    elif score >= 1:
        return "maybe"
    else:
        return "dont_delegate"


def triage_issue(title: str, body: str, labels: list[str]) -> dict:
    """Full triage of a single issue."""
    issue_type = classify_issue_type(title, body, labels)
    complexity = estimate_complexity(title, body, labels)
    score, reasoning = compute_candidate_score(title, body, labels)
    devin_fit = determine_devin_fit(score)
    recommendation = determine_recommendation(score)

    return {
        "issue_type": issue_type,
        "complexity": complexity,
        "candidate_score": score,
        "devin_fit": devin_fit,
        "recommendation": recommendation,
        "reasoning": reasoning,
    }
