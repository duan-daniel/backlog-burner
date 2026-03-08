"""Generate structured prompts for Devin sessions."""


def generate_acceptance_criteria(title: str, body: str, issue_type: str) -> str:
    """Generate acceptance criteria from issue details."""
    criteria = []

    if issue_type == "bug":
        criteria.append("The reported bug is fixed and no longer reproducible")
        criteria.append("Existing tests still pass")
        criteria.append("A regression test is added if feasible")
    elif issue_type == "docs":
        criteria.append("Documentation is updated or added as described")
        criteria.append("All links and references are valid")
        criteria.append("Content is clear and follows existing doc style")
    elif issue_type == "refactor":
        criteria.append("Code is refactored as described without changing behavior")
        criteria.append("All existing tests still pass")
        criteria.append("No new warnings or lint errors are introduced")
    else:  # feature
        criteria.append("The feature works as described in the issue")
        criteria.append("Tests are added for the new functionality")
        criteria.append("The implementation follows existing code patterns")

    criteria.append("PR includes a clear summary of changes")
    return "\n".join(f"- {c}" for c in criteria)


def generate_prompt(
    issue_number: int,
    title: str,
    body: str,
    repo_name: str,
    issue_type: str,
) -> str:
    """Generate a structured prompt for Devin."""
    acceptance_criteria = generate_acceptance_criteria(title, body, issue_type)

    prompt = f"""Resolve GitHub issue #{issue_number}: {title}

Issue details:
{body}

Repository:
{repo_name}

Likely task type:
{issue_type}

Constraints:
- Keep the change minimal and scoped to this issue
- Do not modify unrelated modules
- Add or update tests if possible
- Run relevant validation steps before opening a PR
- If the issue is underspecified or root cause is unclear, stop and summarize blockers rather than guessing

Acceptance criteria:
{acceptance_criteria}

Return:
- implemented fix if feasible
- PR summary with root cause, fix, and validation"""

    return prompt
