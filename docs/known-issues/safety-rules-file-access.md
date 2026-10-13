# Safety Rules file access — what is and is NOT protected

**Status:** implemented locally, NOT deployed. No production configuration changed.

## What is implemented

Safety Rules files are served through the API, never by URL:

```
GET /api/safety-rules/:id/file
```

That endpoint runs the **same course check as the record itself** before touching storage,
and the row returned to the frontend has the storage fields stripped
(`toClientRule()` emits only `has_file`, never `file_url` or `file_public_id`). The
frontend holds no Cloudinary URL — `SafetyRulesTab.jsx` opens files through
`api.safetyRuleFileUrl(id)` and has nothing else to open them with.

Verified by `tests/safetyRules.verify.js`:

- a Course Admin fetching another course's file → **404**, and Cloudinary is **never contacted**
- a student fetching another course's file → **404**
- no response body for list or view contains `cloudinary` or `file_url`
- responses are `Cache-Control: private, no-store`

## 🔴 What this does NOT do — the honest part

**It does not make the underlying Cloudinary asset private.**

The upload uses an **unsigned preset**:

```js
formData.append("upload_preset", preset);   // no CLOUDINARY_API_SECRET anywhere
```

Assets created that way are **public in Cloudinary's delivery layer**. A URL of the form

```
https://res.cloudinary.com/<cloud-name>/image/upload/<public_id>.<format>
```

is directly fetchable by **anyone who holds it**, regardless of this application. The proxy
removes the URL from the app; it cannot revoke a URL that already exists in Cloudinary.

### So, concretely — is confidentiality achieved?

**No. Not yet.** This is **IDOR protection**, not confidentiality.

What closes the gap:

| Scenario | Protected today? |
|---|---|
| Student never had the URL, guesses a rule id | ✅ yes |
| Course Admin requests another course's file by id | ✅ yes |
| Course Admin edits the request body / query string | ✅ yes |
| **Someone already has a Cloudinary URL (shared link, referrer header, proxy log, browser history, an earlier build)** | ❌ **no** |

**I am not claiming file privacy until the second row is also covered.**

## Residual risk

1. **Any Cloudinary URL already handed out stays valid forever.** The API cannot revoke it.
2. **Referrer leakage.** If a rule page links a Cloudinary URL, the browser may send it to
   a third-party host on that page. The new module never emits such a link, which stops
   *new* leakage, but URLs from the previous Manuals module may already have travelled.
3. **Deleting a Safety Rule does not delete its Cloudinary asset.** Rows are removed; the
   stored object remains in the bucket and remains publicly reachable by URL.
4. **Existing `manuals` rows and files are untouched**, including any `file_url` values
   already present. They are outside the Safety Rules proxy entirely.

## Proposed follow-up — requires your approval, changes production config

Two stages, cheapest first.

### Stage 1 — rotate what is already out (no config change)

Not applicable on its own; nothing to rotate while we do not hold URLs.

### Stage 2 — make new uploads private (requires one new env var)

1. Add **`CLOUDINARY_API_SECRET`** to the Render service (`render.yaml` + dashboard).
   This is a **production configuration change** and is not done.
2. Change Safety Rules upload to `type: authenticated` and store `public_id` only.
3. Serve via a **short-lived signed URL** generated server-side after the course check
   (e.g. 60-second expiry), instead of proxying the bytes.

This makes the raw asset unreachable without the secret, and a leaked signed URL expires
almost immediately. After it, the "already has a URL" row above becomes ✅.

### Stage 3 — deal with objects that already exist

Re-upload or delete the legacy assets through the Cloudinary API, or accept them as public
forever. Requires inventory of what is out there.

## Explicitly out of scope here

- No `CLOUDINARY_API_SECRET` was added anywhere.
- No production configuration was changed.
- No existing asset was deleted, re-uploaded or made private.
- The `manuals` module and its files were not touched.