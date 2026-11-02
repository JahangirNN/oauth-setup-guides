# Setup observations

This directory is for records of real setup attempts. An observation is not a
documentation claim and it should not be written until the attempt has actually
been made.

All seven shipped guides currently carry one observation, recorded from the
operator's manual run on 2026-11-01 (three runs per app, all passing). Each
record is operator-reported and kept separate from the quoted documentation
claims.

## Record one

1. Copy the shape below into `data/observations/<guide-slug>.json`.
2. Replace every placeholder with what actually happened.
3. Never copy a client secret, access token, refresh token, password, or cookie
   into the file. Set `credentialsStored` to `false`.
4. Attach it to the guide:

```bash
npm run record-observation -- data/observations/<guide-slug>.json
```

5. Re-run `npm run typecheck`, `npm run selftest`, and `npm run build`.

```json
{
  "slug": "github-oauth-2encvo",
  "observation": {
    "id": "github-console-2026-10-29",
    "provider": "GitHub",
    "attemptedAt": "2026-10-29T14:00:00.000Z",
    "method": "console",
    "outcome": "created",
    "steps": [
      {
        "label": "Open the OAuth app registration page",
        "detail": "Observed the Developer settings location and the registration form.",
        "outcome": "observed"
      },
      {
        "label": "Create the app",
        "detail": "Observed a generated Client ID and a one-time Client Secret.",
        "outcome": "observed"
      }
    ],
    "created": {
      "oauthApp": true,
      "clientId": true,
      "clientSecret": true,
      "submittedForReview": false
    },
    "credentialsStored": false,
    "notes": "The client secret was not copied into this repository or the guide."
  }
}
```

Use `"outcome": "partial"` or `"blocked"` when the attempt stops. A blocked
attempt is useful evidence: it tells the reader exactly where the flow failed.
