#!/usr/bin/env python3
"""
Trello → Planly migration script.

Usage:
    python3 scripts/import-trello.py <trello-export.json>

What it does:
  - Reads a Trello board JSON export (File → Print/Export → Export as JSON in Trello)
  - Creates a new Planly project named after the board
  - One milestone task per open Trello list (column)
  - One task per open Trello card, linked to its list's milestone as a prerequisite
  - Trello card descriptions are imported as task descriptions
  - Trello checklist items become subtasks

Requirements:
  - PLANLY_URL   - base URL of your Planly instance, e.g. https://planly.example.com
  - PLANLY_TOKEN - Personal Access Token (Settings → Access Tokens → New token)
  Both can be set as environment variables or entered interactively.
"""

import json
import os
import sys
import time
import urllib.request
import urllib.error
from getpass import getpass

# ── Helpers ───────────────────────────────────────────────────────────────────

def api(method: str, path: str, body=None, base_url="", token="") -> dict:
    """Fire an API request and return the parsed JSON response."""
    url = base_url.rstrip("/") + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req) as resp:
            raw = resp.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        body_text = e.read().decode(errors="replace")
        print(f"\n  ERROR {e.code} {method} {path}")
        print(f"  {body_text}")
        raise SystemExit(1) from e


def progress(msg: str):
    print(f"  {msg}")


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    # ── Read the Trello export ────────────────────────────────────────────────
    if len(sys.argv) < 2:
        print("Usage: python3 scripts/import-trello.py <trello-export.json>")
        sys.exit(1)

    with open(sys.argv[1], encoding="utf-8") as f:
        board = json.load(f)

    board_name = board.get("name", "Imported Board")

    # ── Prompt for connection details ─────────────────────────────────────────
    base_url = os.environ.get("PLANLY_URL", "").strip()
    if not base_url:
        base_url = input("Planly URL (e.g. https://planly.example.com): ").strip()

    token = os.environ.get("PLANLY_TOKEN", "").strip()
    if not token:
        token = getpass("Personal Access Token: ").strip()

    def call(method, path, body=None):
        return api(method, path, body, base_url=base_url, token=token)

    # ── Verify connectivity ───────────────────────────────────────────────────
    print(f"\nConnecting to {base_url} …")
    try:
        me = call("GET", "/api/auth/me")
    except SystemExit:
        print("Could not connect. Check PLANLY_URL and PLANLY_TOKEN.")
        sys.exit(1)
    username = me.get("username", me.get("id", "unknown"))
    print(f"Authenticated as: {username}")

    # ── Filter open lists and cards ───────────────────────────────────────────
    lists = [lst for lst in board.get("lists", []) if not lst.get("closed")]
    cards = [c for c in board.get("cards", []) if not c.get("closed") and not c.get("archived")]
    checklists_by_id = {cl["id"]: cl for cl in board.get("checklists", [])}

    # Build comment lookup: card_id → list of comment texts (newest last)
    comments_by_card: dict[str, list[str]] = {}
    for action in reversed(board.get("actions", [])):
        if action.get("type") == "commentCard":
            card_id = action.get("data", {}).get("card", {}).get("id")
            text = action.get("data", {}).get("text", "").strip()
            if card_id and text:
                comments_by_card.setdefault(card_id, []).append(text)

    list_id_to_name = {lst["id"]: lst["name"] for lst in lists}
    cards_by_list = {lst["id"]: [] for lst in lists}
    for card in cards:
        lst_id = card.get("idList")
        if lst_id in cards_by_list:
            cards_by_list[lst_id].append(card)

    print(f"\nBoard: {board_name}")
    print(f"  {len(lists)} open lists → milestones")
    print(f"  {len(cards)} open cards  → tasks")

    confirm = input("\nProceed? [y/N]: ").strip().lower()
    if confirm != "y":
        print("Aborted.")
        sys.exit(0)

    # ── Create a dedicated team for this import ───────────────────────────────
    # Every import gets its own new team (mirroring how "New Project" works in the app) rather
    # than reusing an existing one. Reusing a team would silently grant that team's existing
    # members access to this new project - access must always be an explicit, per-project
    # invite that the other person accepts, never a side effect of who happened to be on a
    # team from a previous import.
    team = call("POST", "/api/teams", {"name": f"{board_name} Team"})

    # ── Create the Planly project ─────────────────────────────────────────────
    print(f'\nCreating project "{board_name}" …')
    # Deadline is required for product creation; pick 1 year out as a placeholder
    import datetime
    deadline_placeholder = (datetime.date.today() + datetime.timedelta(days=365)).isoformat()

    product = call("POST", "/api/products", {
        "name": board_name,
        "teamId": team["id"],
        "deadline": deadline_placeholder,
    })
    product_id = product["id"]
    print(f"  Created project id={product_id}")

    # ── Create one milestone task per Trello list ─────────────────────────────
    print("\nCreating milestones …")
    list_to_milestone_id: dict[str, str] = {}

    for i, lst in enumerate(lists):
        # Use a deadline spread across the next few months so they appear in order on the Gantt
        days_out = 60 + i * 30
        deadline = (datetime.date.today() + datetime.timedelta(days=days_out)).isoformat()
        milestone = call("POST", f"/api/products/{product_id}/tasks", {
            "name": lst["name"],
            "deadline": deadline,
        })
        list_to_milestone_id[lst["id"]] = milestone["id"]
        progress(f"Milestone: {lst['name']}")

    # ── Create one task per Trello card, then link it to its milestone ────────
    print("\nCreating tasks …")
    created = 0
    skipped = 0

    for lst in lists:
        milestone_id = list_to_milestone_id[lst["id"]]
        list_cards = cards_by_list.get(lst["id"], [])

        for card in list_cards:
            card_name = card.get("name", "Untitled").strip()
            if not card_name:
                skipped += 1
                continue

            # Build description: card description + any Trello comments
            desc_parts = []
            if card.get("desc"):
                desc_parts.append(card["desc"].strip())
            for comment in comments_by_card.get(card["id"], []):
                desc_parts.append(comment)

            desc = "\n\n".join(desc_parts) if desc_parts else None
            # Truncate descriptions longer than 50 000 chars (Planly's schema limit)
            if desc and len(desc) > 50000:
                desc = desc[:49997] + "…"

            task = call("POST", f"/api/products/{product_id}/tasks", {
                "name": card_name[:500],
                "description": desc,
            })

            if not isinstance(task, dict) or "id" not in task:
                print(f"\n  WARN: unexpected response for card '{card_name}', skipping.")
                print(f"  Response: {task}")
                skipped += 1
                continue

            task_id = task["id"]

            # Checklist items → subtasks
            for cl_id in card.get("idChecklists", []):
                checklist = checklists_by_id.get(cl_id)
                if not checklist:
                    continue
                for item in checklist.get("checkItems", []):
                    item_name = item.get("name", "").strip()[:200]
                    if item_name:
                        call("POST", f"/api/products/{product_id}/tasks/{task_id}/subtasks", {
                            "name": item_name,
                        })

            # Link this task as a prerequisite for the milestone
            # (milestone depends on card task: card must be done before milestone is reached)
            call("POST", f"/api/products/{product_id}/tasks/{milestone_id}/dependencies", {
                "prerequisiteId": task_id,
            })

            progress(f"  [{list_id_to_name[lst['id']]}] {card_name}")
            created += 1

            # Small delay to avoid overwhelming the server
            time.sleep(0.05)

    # ── Done ──────────────────────────────────────────────────────────────────
    print(f"\nDone! Created {len(lists)} milestones and {created} tasks ({skipped} skipped).")
    print(f"Open your project at: {base_url.rstrip('/')}")


if __name__ == "__main__":
    main()
