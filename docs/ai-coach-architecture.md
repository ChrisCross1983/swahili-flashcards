# AI Coach v3: Pedagogical Intelligence Layer

## 1) What changed conceptually
The coach no longer selects an exercise directly from card type. It now runs a teacher-like micro-planning flow:

1. **Card Interpretation** (`cardInterpreter.ts`)
   - Builds a deterministic `CardPedagogicalProfile` from card text + enrichment.
   - Identifies linguistic unit, POS, morphology, complexity, difficulty, and safe exercise capabilities.

2. **Pedagogical Planning** (`planner.ts`)
   - Chooses a **LearningObjective** first (e.g. `recognition`, `guidedRecall`, `contextUsage`).
   - Maps objective → task type with rationale and constraints.

3. **Objective-driven Task Generation** (`tasks/generate.ts`)
   - Generates tasks from `objective + cardProfile`, not from random fallback heuristics.
   - Preserves deterministic fallback safety (e.g. cloze only with valid examples, otherwise translate).

4. **Evaluation + Error Semantics** (`evaluator.ts`)
   - Returns richer result payload: `intent`, `confidence`, `errorCategory`, `explanation`.
   - Detects pedagogically useful categories (noun class issue, form issue, word order, semantic confusion, no attempt).

5. **Hint Intelligence** (`hintEngine.ts`)
   - Hint levels now depend on profile + inferred error intent.
   - Strategies: semantic / contrast / form / prefix / nounClass.

6. **Adaptive sequencing** (`/api/aiCoach/next`)
   - Wrong answer triggers remediation objective (`recognition` or `guidedRecall`).
   - Strong correct responses can move into `contextUsage`.

---

## 2) Updated module structure
- `src/lib/aiCoach/cardInterpreter.ts` (new)
- `src/lib/aiCoach/hintEngine.ts` (new)
- `src/lib/aiCoach/planner.ts` (updated for objectives)
- `src/lib/aiCoach/tasks/generate.ts` (updated to consume objective + profile)
- `src/lib/aiCoach/enrichment/generateEnrichment.ts` (AI-first examples + validation + safe fallback)
- `src/lib/aiCoach/evaluator.ts` (expanded diagnostics)
- `src/lib/aiCoach/types.ts` (new pedagogical and error contracts)
- `src/app/api/aiCoach/start/route.ts` (profile + objective pipeline)
- `src/app/api/aiCoach/next/route.ts` (objective planning + remediation loop)
- `src/components/trainer/AiCoachPanel.tsx` (micro-lesson style result card + UX wording)

---

## 3) Design guarantees (safety)
- AI is optional and never blocks the learning flow.
- Heuristic evaluation and deterministic task generation remain primary fallbacks.
- Example generation is validated; unsafe template-like examples are filtered out.
- If no safe example exists, coach continues without forcing poor content.

---

## 4) Migration plan (minimal disruption)

### Phase A (done)
- Introduce new types (`LearningObjective`, `CardPedagogicalProfile`, `ErrorCategory`).
- Wire interpreter + planner into `start`/`next` routes.
- Keep API compatibility by preserving existing `task.type` and result core fields.

### Phase B (done)
- Move hint creation to strategy-based engine.
- Extend evaluator output with confidence + explanation + error category.
- Add remediation objective override in `next` route.

### Phase C (next recommended)
- Persist objective/error analytics in DB for longitudinal pedagogy tuning.
- Add per-card explanation/example caches with TTL in Supabase.
- Add objective distribution dashboards (to verify teacher-like pacing).

### Phase D (next recommended)
- Introduce explicit `contextUsage` task renderer in UI (sentence completion composer).
- Add objective-aware A/B tests for retention and engagement outcomes.