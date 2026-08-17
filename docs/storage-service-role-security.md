# Storage and service-role security notes

Prepared on 2026-08-17 from repository code only. No Supabase project was
queried and no production settings were changed.

## Storage status

The app currently expects public object URLs:

- `card-images`: `/storage/v1/object/public/card-images/...`
- `card-audio`: `/storage/v1/object/public/card-audio/...`

The code stores storage paths, not full URLs, in card rows:

- `cards.image_path`
- `cards.audio_path`

Public URLs are assembled in client components and hooks from
`NEXT_PUBLIC_SUPABASE_URL` plus the stored path. `getPublicUrl()` is not used.
Signed URLs are not used.

## Privacy risk

If the buckets are public, an image or audio object can be fetched without login
by anyone who knows the URL. This is expected by the current runtime code.

Path exposure:

- Audio paths use `${ownerKey}/${cardId}-${timestamp}.${ext}`.
- Image paths use `${ownerKey}/${uuid}.${ext}`.

Realistic risk:

- Random image UUID paths are hard to guess.
- Audio paths include a user ID folder and card ID plus timestamp. They are still
  hard to enumerate without knowing IDs, but they expose identifiers to anyone
  who sees the URL.
- Public URLs may be shared by browser caches, logs, screenshots, network traces
  or copied page content.

Theoretical risk:

- Public buckets provide no authorization check at object fetch time.
- If a path leaks, access persists until the object is removed or bucket policy
  changes.

## Why buckets were not switched to private in this step

Changing to private buckets would require coordinated code and data migration:

1. Replace all direct public URL assembly with an authenticated URL resolver.
2. Add API routes or server helpers for signed image/audio URLs.
3. Preserve trainer audio preloading without adding a network roundtrip on reveal.
4. Decide signed URL lifetimes and refresh behavior.
5. Update image rendering in trainer, quick search and form previews.
6. Verify CDN/browser caching strategy for signed URLs.
7. Change bucket privacy and storage policies only after code is deployed.

A reasonable signed URL lifetime would be short for private media, for example
10 to 60 minutes. Audio preloading may benefit from issuing signed URLs when a
session starts and refreshing them only if a session stays open longer than the
chosen lifetime.

## Recommended private-bucket migration order

1. Add authenticated media URL endpoints that accept a card ID, verify
   `owner_key = user.id`, and return signed URLs for the stored paths.
2. Update client code to request media URLs ahead of use:
   - current trainer card audio
   - next trainer card audio
   - card images in trainer/search/form views
3. Keep existing public URLs as a fallback during rollout.
4. Add tests for unauthenticated media access and cross-owner card IDs.
5. Deploy code while buckets remain public.
6. Switch buckets to private in a controlled environment.
7. Remove public URL fallback after production verification.

## Service-role rule

For user operations, the request body must never decide the privileged
`owner_key` target. Server routes must derive the owner from the authenticated
Supabase user.

The high-risk route identified in the schema audit was hardened:

- `/api/migrate` now requires authentication.
- `toKey` is derived from `user.id`.
- A request-supplied `toKey` is accepted only if it matches `user.id`.
- Service-role writes are not reached for unauthenticated or cross-owner target
  requests.

The route remains a legacy migration path for `ramona_owner_key` localStorage
data and currently migrates `cards` and `card_progress`.

Residual risk: `fromKey` still comes from the client because the server cannot
read historical localStorage. The old key format is not reproducible from the
current repository, so this step did not add a format restriction that could
break legitimate legacy migration. Long-term, remove this route after the legacy
migration window ends.
