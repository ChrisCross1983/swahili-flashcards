This is a [Next.js](https://nextjs.org) app for a Swahili flashcard trainer.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the app by modifying files under `src/app`. The page auto-updates as you edit the file.

## Database and Supabase

Supabase schema documentation lives in:

- `docs/supabase-schema.md`
- `supabase/migrations/`

The migration folder currently contains only repository-backed baseline SQL. The
core production schema is documented from application code but is not yet a full
verified schema dump. Do not run migrations blindly against production.

Required Supabase-related environment variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_STORAGE_BUCKET`

Never commit secret values. API routes currently authenticate users with the
cookie/anon client and then use a service-role client for most database work.
Tenant isolation therefore depends on explicit `owner_key = user.id` filters in
server routes; planned RLS policies are documented but not automatically applied.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Environment

- `PEXELS_API_KEY`: API key for image suggestions via the Pexels Search API. Set this in a local `.env.local` file for development and as a protected environment variable in Vercel for deployment.
- `OPENAI_API_KEY`: Server-only API key for AI features, including translator transcription and text translation. Never expose it through a `NEXT_PUBLIC_` variable.
- `NEXT_PUBLIC_TRANSLATOR_REMOTE_DIAGNOSTICS_ENABLED=true`: explicitly enables the classic translator's consent-gated technical telemetry transport. It defaults to off and must only be enabled after the prepared diagnostics migration has been reviewed and applied. Text corrections and audio use separate consent paths; remote audio upload remains disabled.
- `NEXT_PUBLIC_CLASSIC_REALTIME_TRANSCRIPTION_ENABLED=false`: emergency kill switch for classic-translator realtime STT. When disabled, recordings use the validated audio-upload fallback; translation and TTS remain unchanged.
- `NEXT_PUBLIC_CLASSIC_REALTIME_WEBKIT_ENABLED=true`: internal/deployment-only opt-in for the classic realtime experiment on WebKit/iOS. It defaults to the validated upload-STT safe path, performs no background realtime setup while disabled, and still requests a fresh microphone stream per turn. Do not enable this in public production before real-device promotion criteria are met.
- `NEXT_PUBLIC_TRANSLATOR_INTERNAL_QA_ENABLED=true`: build-time opt-in for internal translator failure simulations and speech-review controls. Production builds do not expose them unless this flag was explicitly set during the build.
- `NEXT_PUBLIC_BACKEND_ENVIRONMENT_LABEL=development|staging|production`: explicit, non-secret service-environment label used by translator diagnostics. It is never inferred from a Supabase or API URL, so a localhost frontend can truthfully report that it is exercising production services.
- `NEXT_PUBLIC_FRONTEND_RUNTIME_ENVIRONMENT=development|preview|production`: optional explicit frontend label when Vercel metadata is unavailable. Localhost is always reported as `development`; Vercel builds should also expose commit/deployment metadata through the existing public build variables.
## Translator versioning

The application version reported by translator diagnostics comes from
`NEXT_PUBLIC_APP_VERSION` when explicitly supplied by a deployment and otherwise
from the checked-in `package.json` version injected by `next.config.ts`. A
production report must never use an environment label such as `development` as
its application version.

## WebKit realtime promotion gate

The WebKit realtime flag is promoted manually, never by runtime learning. A
candidate build must first complete at least 20–30 consecutive real-device turns
without capture failure, stale tracks, invalid tiny audio, or reconnect storms,
and should exceed 90% realtime attempt success. Upload STT remains available as
the safe recovery path after promotion.

## Classic translator mic-start and feedback schema

The complete classic recording-start operation is capped at 14 seconds. The
existing 12-second `getUserMedia` watchdog remains the inner acquisition bound;
the extra two seconds cover recorder preparation and deterministic cleanup.
Pre-turn lifecycle metadata is content-free and persisted best-effort in the
existing translator incident store so a refresh does not erase a mic-start
failure.

The current `translator_feedback` payload requires the base table migration
`20260820000000_translator_feedback.sql`, the performance columns from
`20260824000000_translator_feedback_performance.sql`, and the realtime timing
columns from `20260829000000_translator_realtime_performance.sql`. `PGRST204`
indicates a schema-cache/column mismatch, not by itself a missing table. Apply
pending migrations only after explicitly checking the production migration
history; the application never applies or promotes them automatically.

## Classic translator functional diagnostics

Report revision `5.2.5` evaluates product health from organic turns and keeps
intentional QA simulations in a separate QA summary. Legacy session totals stay
available for diagnostic compatibility. TTS reports generation and browser
playback separately, including disabled, blocked, aborted, and cached replay
outcomes; a TTS degradation never changes a successful speech-and-translation
turn into a failed product turn.

When the build-time internal QA flag, Speech Quality Mode, and per-turn audio
consent are all active, a successful Realtime turn can send its already recorded
MediaRecorder blob once through the existing safe audio-STT gateway. This
transcribe-only benchmark runs after the product result has been committed and
never changes translation, TTS, routing, product health, or public-user cost.
Confirmed ground truth and deterministic exact-match/WER metrics remain in the
local consented QA report and incident store.
