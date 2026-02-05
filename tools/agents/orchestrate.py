#!/usr/bin/env python3
"""Simple multi-agent orchestration scaffold for The Beat Boutique."""

import sys
from agents import Agent, Runner


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: python tools/agents/orchestrate.py \"<task>\"")
        return 1

    task = " ".join(sys.argv[1:]).strip()
    if not task:
        print("Error: task is empty")
        return 1

    planner = Agent(
        name="Planner",
        instructions=(
            "Scope the request, identify sources of truth, and propose a step-by-step plan. "
            "Call out generated vs. hand-edited content and required scripts."
        ),
        handoff_description="Plan and scope the task. Decide which files and scripts are involved.",
    )

    implementer = Agent(
        name="Implementer",
        instructions=(
            "Make the requested changes carefully and minimally. "
            "Follow repo rules for generated content and SEO fields."
        ),
        handoff_description="Implement changes with minimal diffs and correct sources of truth.",
    )

    reviewer = Agent(
        name="Reviewer",
        instructions=(
            "Review the changes for regressions, missing generator runs, and SEO issues. "
            "Return actionable findings in a short list."
        ),
        handoff_description="Review diffs for regressions, missing steps, and SEO correctness.",
    )

    coordinator = Agent(
        name="Coordinator",
        instructions=(
            "You are the coordinator. Decide whether to hand off to Planner, Implementer, "
            "or Reviewer based on the task. Use a handoff when a specialist should take over. "
            "Keep responses concise and actionable."
        ),
        handoffs=[planner, implementer, reviewer],
    )

    result = Runner.run_sync(coordinator, task)
    print(result.final_output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
