# Repo

A flexible kanban space for work, personal plans, learning, or any activity. Everything runs in your browser and stays on your device.

Copyright © 2026 Alzam A. All Rights Reserved. Released under the MIT License (see `LICENSE`).

## Features

- Boards with customizable stages, drag and drop, list view, search, filter and sort
- Notes up to 4000 characters per item, shown only in the item's detail view
- Trash with a fly-to-bin animation; keep-time of 7 days, 30 days or never
- English (US), Indonesian and Japanese through next-intl
- Backup and restore as a verified ZIP, with optional passphrase encryption and a merge that asks before replacing anything
- Desktop sidebar with sticky footer; floating bottom bar on phones
- Settings for language, boards, menu order, trash and animation, plus privacy and version information

## Develop

    npm install
    npm run dev          # http://localhost:3000 (redirects to /en/, /id/ or /ja/)
    npm run typecheck    # TypeScript check
    npm test             # storage, backup, merge, translation and interface tests
    npm run build        # static site in ./out

## Deploy (GitHub Pages)

1. Push to `main`. In Settings > Pages, set Source to "GitHub Actions" and enable "Enforce HTTPS".
2. At your DNS provider add a CNAME record: `repo` -> `<github-username>.github.io`.
3. `public/CNAME` holds the custom domain. The workflow type-checks, tests, builds and deploys.

## Releasing

The version lives only in `package.json` (shown in the footer and Settings, written into backups). Update it together with `CHANGELOG.md`, then tag the commit. The first release is `1.0.0`.

## Add a language

1. Copy `messages/en.json` to `messages/<code>.json` and translate the values. Keep the `{placeholders}` and plural forms; write naturally rather than word for word.
2. Add the code to `LOCALES`, `LOCALE_TAGS` and `LOCALE_NAMES` in `src/i18n/routing.ts`.
3. Run `npm test`: it checks the keys, placeholders and message syntax against English.

## Structure

    messages/          translations (en, id, ja)
    src/app/           routes: /[locale]/ (app), /[locale]/privacy/, root redirect
    src/i18n/          routing, typed message keys, next-intl adapter
    src/lib/storage/   database, repositories, services (OOP, UI-independent)
    src/lib/backup/    ZIP codec, validator, merge planner, step runner, backup and restore flows
    src/lib/errors/    AppError, error center, user-facing descriptions
    src/lib/workspace/ controller, hooks and ordering helpers
    src/components/    UI: board, settings, trash, backup, legal and shared controls
    tests/             storage, backup, merge, translations and interface tests

See `SECURITY.md` for privacy, backup verification and error handling.
