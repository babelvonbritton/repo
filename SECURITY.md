# Security and privacy notes

Repo is a static site. There is no backend, no account system and no analytics.

- **Data stays on the device.** Boards, stages, items, notes, the trash and settings live in the browser's IndexedDB. Only the chosen language and last board are kept in localStorage. Nothing is sent to any server. The full plain-language policy is in the app (Settings, or the footer link "Privacy & Policy").
- **No third-party requests.** Scripts, styles and fonts come from the same origin. The Content Security Policy (set in `src/app/[locale]/layout.tsx`) blocks everything else and the referrer is suppressed.
- **Input limits are enforced in the storage layer** (`Guard`), not only in the UI. Notes are capped at 4000 characters.
- **Trash keep-time** is set by the user: 7 days, 30 days or never. Expired entries are purged on every app start and every 10 minutes.
- **Known limits of static hosting.** GitHub Pages cannot set HTTP headers, so the CSP is a meta tag (it cannot carry `frame-ancestors`) and it must allow `'unsafe-inline'` for the scripts Next.js emits. Enable "Enforce HTTPS" in the repository's Pages settings.
- **Browser storage is not encrypted** and can be cleared by the user or the browser. Do not store secrets in items or notes.

## Backup and restore

- A backup is a ZIP holding only `manifest.json` and `data.json`. The manifest records the format and schema version, the app version, a SHA-256 of `data.json`, and a SHA-256 plus record count for every store.
- Backups can optionally encrypt `data.json` with AES-256-GCM. A key is derived from the user's passphrase with PBKDF2-SHA-256 (310,000 iterations) and a fresh random salt; every backup also gets a fresh random GCM nonce. The manifest identifies encrypted format version 2 and stores the parameters needed to derive the key. Its metadata and checksums remain visible, but the backup records are encrypted. The passphrase is never stored, and cannot be recovered; the restore flow decrypts and authenticates the data before validating or writing anything. Unencrypted format version 1 backups remain supported.
- Before anything is read, a restore checks the ZIP signature, the file allowlist (any other entry, such as a path like `../x`, is rejected), the archive size (25 MB) and the declared expanded size (50 MB).
- It then verifies size and checksums, and validates every record: types, length limits, allowed values, unique ids, and references between boards, stages, items, notes and trash. Unknown fields are dropped, so a crafted file cannot add behavior or pollute prototypes.
- **Restore never replaces data silently.** Each record in the backup is compared with the current data by id. Records that do not exist are added; identical records are left alone; records that exist with different content are shown field by field and the user chooses, per record, to keep the current version or replace it. Unchosen differences are kept as they are.
- The combined result is validated again, then written in a single IndexedDB transaction, so a failed write leaves the data untouched. If the data changed after the comparison was made, nothing is written. The result is verified afterwards and rolled back automatically if it fails. An optional safety backup of the current data is downloaded first.
- Checksums detect corruption and accidental edits. They do not prove who made a file: anyone can build a valid backup, which is why structure validation, not the checksum, is what keeps hostile files out. Only restore backups you trust.
- Unencrypted backups contain every note, so store them as carefully as the notes themselves. Use passphrase encryption when you need confidentiality.

## Preferences

Settings (trash keep-time, floating bin, deletion animation, menu order) are stored in the `settings` store and are part of backups. Values read back from the database are validated; anything not allowed falls back to its default and is reported.

## Error handling

Every failure goes through one error center (`src/lib/errors`): it is normalized into a coded `AppError`, logged, and shown either as a notification or inline where the user is working. Uncaught errors, unhandled promise rejections and rendering crashes are captured too. "Copy diagnostics" produces a report with error codes and record paths only, never item or note text.

Report vulnerabilities through GitHub's private vulnerability reporting on this repository.
