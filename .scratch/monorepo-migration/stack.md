# Delivery: one stacked pull request per ticket

The spec calls for "a stack of small pull requests that land together, so each is reviewable on its own". That is a `gh stack` stack: an ordered list of branches rooted on `master`, each branch based on the one below it, each with one pull request whose base is the branch below — so a reviewer sees only that layer's diff. Use the `gh-stack` skill for the mechanics; this file records the layout and the conventions specific to this migration.

## Layout

Trunk is `master`. Layers bottom to top, matching the ticket numbers:

| Layer | Branch                           | Ticket                                                 |
| ----- | -------------------------------- | ------------------------------------------------------ |
| 1     | `migration/01-scaffold`          | 01 Scaffold the monorepo                               |
| 2     | `migration/02-move-workspaces`   | 02 Move the three projects in as workspaces            |
| 3     | `migration/03-pull-request-ci`   | 03 Verify every pull request through one workflow      |
| 4     | `migration/04-openapi-package`   | 04 Make the specification exist exactly once           |
| 5     | `migration/05-container-image`   | 05 Build the manager image from a pruned workspace     |
| 6     | `migration/06-e2e-gate`          | 06 Make the e2e suite a gate on unreleased code        |
| 7     | `migration/07-umbrella-chart`    | 07 Publish the chart under the product name            |
| 8     | `migration/08-release-config`    | 08 Configure two version lines                         |
| 9     | `migration/09-delivery-pipeline` | 09 Keep delivery working, driven by a generated matrix |
| 10    | `migration/10-sdk-publish`       | 10 Publish the SDK from its own tag, validated         |
| 11    | `migration/11-knip`              | 11 Report unused files, exports and dependencies       |
| 12    | `migration/12-e2e-lint`          | 12 Lint and format the e2e suite for the first time    |
| 13    | `migration/13-housekeeping`      | 13 Leave one repository a newcomer can pick up         |

## Stack order is not the same as the blocking graph

A stack is linear; the tickets' blocking edges are not. Two lines are genuinely independent — continuous integration, the specification package, the container image and the e2e gate on one side; the chart, release configuration and delivery on the other — and they rejoin at layer 9, which needs both. The stack order is a linearisation of that graph, so it is a superset of the real dependencies: layer 7 sits above layer 6 because a stack has to put it somewhere, not because the chart needs the e2e gate.

The consequence to remember: **the `Blocked by` line in each ticket, not the layer number, tells you what actually has to be correct before the work makes sense.** If a layer turns out to depend on nothing below it, that is expected — do not go looking for a dependency to justify the position.

## Working a ticket

Each ticket ends with its branch pushed and its pull request submitted at its layer.

Bottom layer, once:

```bash
gh stack init migration/01-scaffold        # trunk is the default branch
```

Every later layer — from the branch below it:

```bash
gh stack checkout migration/02-move-workspaces   # or: gh stack top
gh stack add migration/03-pull-request-ci        # creates and switches
# ... do the work, commit ...
gh stack submit --auto                           # pushes and opens the PRs
```

Fixing a lower layer instead of working around it at the current one:

```bash
gh stack down                    # or: gh stack checkout <branch>
# ... fix, commit ...
gh stack rebase --upstack        # replay every layer above
gh stack push
```

When `master` moves under the stack: `gh stack sync --prune`.

## Landing

The stack lands as a unit: `gh stack merge --yes` merges bottom to top atomically — if any pull request cannot merge, none do. `gh pr merge` does not work on a stacked pull request. Scope a partial landing by pull request number (`gh stack merge <pr> --yes` merges everything up to and including it), which is how to land the lower layers early if review of the upper ones drags.

## Conventions

- Commit scopes must be workspace names once layer 8 lands (with the release and dependency scopes allowed). Before that, keep scopes consistent with what layer 8 will accept, so history does not need rewriting.
- `gh stack view --json` — never bare `gh stack view`, which opens a TUI. `gh stack submit --auto` — never bare `submit`, which prompts per pull request. Always pass branch names positionally to `init`, `add` and `checkout`.
- `--auto` opens drafts; add `--open` to submit ready for review. Each layer is meant to be reviewable on its own, so open for review once its own acceptance criteria pass.
- If `gh stack checkout <pr>` hits an unbypassable conflict prompt because different local tracking state exists, run `gh stack unstack --local` first — that clears local state and leaves the stack on GitHub intact.
- One stack, one story: nothing outside this migration goes into these layers. Dependency version alignment in particular is separate work and a separate stack.
