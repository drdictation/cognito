# Environment Variables for Vercel Production

Add these to your Vercel dashboard (Settings → Environment Variables):

## Google OAuth Credentials

**Get these values from your local files:**
- `GOOGLE_CLIENT_ID` - From `credentials.json` → `installed.client_id`
- `GOOGLE_CLIENT_SECRET` - From `credentials.json` → `installed.client_secret`
- `GOOGLE_REFRESH_TOKEN` - From `token.json` → `refresh_token`

```
GOOGLE_CLIENT_ID=<your-client-id-from-credentials.json>
GOOGLE_CLIENT_SECRET=<your-client-secret-from-credentials.json>
GOOGLE_REFRESH_TOKEN=<your-refresh-token-from-token.json>
```

## Already Set (verify these exist)

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_AI_API_KEY`
- `TRELLO_API_KEY`
- `TRELLO_TOKEN`
- `TRELLO_BOARD_NAME` - Optional board name override for the Trello planning workspace (defaults to `Cognito Task Queue`)

## Cron (legacy auto-ingestion)

To process emails automatically (Vercel Cron → `/api/cron/ingest`), add:

```
CRON_SECRET=<long-random-string>
```

Notes:
- The cron endpoint accepts `Authorization: Bearer $CRON_SECRET` (or `?token=$CRON_SECRET` for manual testing).
- Schedule is configured in `dashboard/vercel.json` (currently every 5 minutes).
- The new Trello-first dashboard does not depend on this cron path for task capture.

## Notes

- The refresh token may need to be regenerated periodically if it expires
- All three Google credentials are still required for legacy Gmail/calendar features
- The Trello planner requires `TRELLO_API_KEY` and `TRELLO_TOKEN`; `TRELLO_BOARD_NAME` is optional
- These are the same credentials used locally in `credentials.json` and `token.json`
- **IMPORTANT**: Never commit the actual secret values to Git
