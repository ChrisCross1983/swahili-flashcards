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
