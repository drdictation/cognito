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

## Notes

- The refresh token may need to be regenerated periodically if it expires
- All three Google credentials must be set for calendar and email features to work
- These are the same credentials used locally in `credentials.json` and `token.json`
- **IMPORTANT**: Never commit the actual secret values to Git
