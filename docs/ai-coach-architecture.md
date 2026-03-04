# AI Coach v2 Architecture (Beginner-Friendly)

## Why the old coach felt mechanical
The previous flow mixed planning, task generation, and enrichment fetching together. That made decisions feel random and slow.

## New architecture
1. **Learner Model (`learnerModel.ts`)**
   - Stores per-user/per-card memory: mastery, due time, error trend, latency, hint use.
   - Updates mastery after each answer with simple transparent rules.

2. **Planner (`planner.ts`)**
   - Reads learner state + recent error history.
   - Returns deterministic `{ taskType, difficulty, rationale, constraints }`.
   - Gives a human-readable reason like “we focus spelling due to repeated typos”.

3. **Task Builder (`tasks/generate.ts` as pure `buildTask`)**
   - Pure function: no DB, no OpenAI.
   - Builds safe tasks only from known data.
   - Cloze is allowed only if an existing sentence actually contains the expected token.
   - If no safe sentence exists, it falls back to translate.

4. **Evaluator (`evaluator.ts`)**
   - Fast heuristic grader always works.
   - Optional OpenAI pass uses strict JSON schema + timeout.
   - On timeout/error, immediate fallback to heuristic result.

## Why this fixes “mechanical trainer”
- Decisions are explainable and stable (not weighted randomness).
- The hot path (`/start`, `/next`) no longer blocks on enrichment generation.
- Wrong examples are avoided by design: if a trustworthy example is missing, no fabricated sentence is shown.
- Ownership is server-derived from `requireUser()`, not client input.

## Refactor plan (implemented)
- Added `src/lib/aiCoach/learnerModel.ts`.
- Added `src/lib/aiCoach/planner.ts`.
- Refactored task generation to pure `buildTask` in `src/lib/aiCoach/tasks/generate.ts`.
- Updated `src/lib/aiCoach/policy.ts` to deterministic planner-backed behavior and safer MCQ choice building.
- Improved `src/lib/aiCoach/evaluator.ts` with stricter classifications and OpenAI timeout fallback.
- Updated API routes:
  - `src/app/api/aiCoach/start/route.ts`
  - `src/app/api/aiCoach/next/route.ts`
  to read learner state and asynchronously schedule enrichment when missing.
- Added regression tests for planner, task builder, evaluator.
