# Translating Tattle

The server app (`apps/web`) speaks English and French: the dashboard, the sign-in pages, the public pages (portal, reporter thread, unsubscribe), the emails and the Discord and Slack messages. The widget (`packages/widget/src/i18n.ts`) and the React Native SDK (`packages/react-native/src/i18n.ts`) have their own, smaller catalogues.

What stays in English on purpose: MCP tool names and descriptions, webhook payloads, REST API errors, logs. Agents and integrations read them, and they must not change with someone's language.

## How the language is chosen

The rule: the language is picked automatically from the browser's (or the device's) on the first visit, a selector changes it, the choice is remembered, robots are never redirected, and an indexable page has one address per language with its hreflang: English by default at the bare address, French under `/fr`.

| Surface | Language |
| --- | --- |
| Dashboard | The person's choice under their name → **Language** (Auto, English, Français), saved on the account. Auto follows the visitor's language below. |
| Sign-in, forgot and reset password | The visitor's language, with an EN / FR selector. |
| Onboarding, OAuth consent | The account's language (signed in), no selector. |
| Public portal (indexable) | Its address's: English at `/portal/<slug>`, French at `/fr/portal/<slug>`, with an EN / FR selector that links between them. A visitor whose language is French is sent from the English address to `/fr` (see below). |
| Reporter thread, unsubscribe | The visitor's language, with an EN / FR selector, even for a signed-in team member. On the thread page, the report's language when the visitor gives none. |
| Team emails (assigned, regression, digest, a reporter answered, AI key, webhook failing, password reset) | The recipient's choice; on Auto, the language their browser last asked for; else English. |
| Invitations | The inviter's dashboard language. |
| Reporter emails (team reply, "shipped" notice) | The report's language, from the device language the widget or SDK sends. |
| Portal voters' "shipped" notice | The visitor's browser language when they left their email. |
| Discord and Slack | Project settings → **Discord and Slack** → Language. English by default. |

### A visitor's language (pages that are not indexed)

On sign-in, password reset, the reporter thread and unsubscribe, the first one that names English or French wins:

1. The `tattle_locale` cookie, set by the EN / FR selector and kept a year.
2. The browser's `Accept-Language`.
3. The page's default (the thread page: the report's language), else English. Robots (known crawler user agents, or no `Accept-Language`) skip step 2.

These pages have one address for both languages and never redirect. Someone on Auto who signs in adopts the cookie's language for their emails.

### The portal's addresses

The portal is the page search engines index, so the address is the language:

- `/portal/<slug>` is always English: the server never answers it in another language.
- `/fr/portal/<slug>` is always French, whatever the browser.
- The English address follows the visitor's remembered language on every visit, as sites usually do. On `/portal/<slug>`:

  | Request | Answer |
  | --- | --- |
  | First visit (no `tattle_locale` cookie), browser preferring French | **302** to `/fr/portal/<slug>` (query string kept), sets `tattle_locale=fr` |
  | Cookie `tattle_locale=fr`, any `Accept-Language` | **302** to `/fr/portal/<slug>`, on every visit |
  | Cookie `tattle_locale=en` (EN picked in the selector) | 200, English |
  | Robot (known crawler user agent, or no `Accept-Language`), with or without a cookie | 200, English |
  | Any other browser without a cookie | 200, English |

- A link to `/fr/portal/<slug>` is never redirected, whatever the cookie says, and opening it does not change the cookie: only the selector and the first-visit redirect set it. So someone who picked EN and follows a shared French link reads it in French, and keeps English on the English address.
- Picking EN in the selector on a `/fr` page goes to `/portal/<slug>` and sets the cookie to `en`: that visitor is never sent back to French. Picking FR sets it to `fr`. The selector, the tabs, the "shipped" email and the dashboard's "Open the public page" link all point at the address of the reader's language.
- The old `?lang=fr` and `?lang=en` addresses answer with a 301 to the address of their language.

Both versions carry the same alternates, and each is its own canonical:

```html
<!-- on /fr/portal/shop -->
<link rel="canonical" href="https://tattle.example.org/fr/portal/shop">
<link rel="alternate" hreflang="en" href="https://tattle.example.org/portal/shop">
<link rel="alternate" hreflang="fr" href="https://tattle.example.org/fr/portal/shop">
<link rel="alternate" hreflang="x-default" href="https://tattle.example.org/portal/shop">
```

The English address sends `Vary: Accept-Language, Cookie`, because of the redirect. The redirect is a request middleware in `src/start.ts`, the rule a pure function in `src/i18n/portal-address.ts`. The thread and unsubscribe pages are private (`noindex`): they have the selector, not the hreflang links.

## Where the text lives

```
apps/web/src/i18n/
  locales.ts        the languages, Accept-Language parsing, normalization
  format.ts         plurals (Intl.PluralRules), numbers, dates
  index.ts          messages(locale), i18n(locale)
  react.tsx         <I18nProvider>, useI18n()
  route.ts          headMessages(matches) for page titles
  messages/en/*.ts  the English catalogue, one file per area of the app
  messages/fr/*.ts  the French catalogue, typed against the English one
```

The English catalogue is the reference. Each French file is typed `typeof en`, so a missing key, an extra key or a message with other parameters fails `pnpm typecheck`.

## Add a string

1. Put the English text in the area's file under `messages/en/` (for example `triage.ts`). Words the whole app uses (statuses, priorities, Save, Cancel…) are in `common.ts`.
2. Add the same key to `messages/fr/` with the French text. `pnpm typecheck` tells you if you forgot.
3. Use it:

   ```tsx
   const { m } = useI18n();
   <h1>{m.triage.title}</h1>
   ```

   In server code (emails, chat messages), take the reader's language and call `messages(locale)`.

Text with values is a function, so its parameters are checked:

```ts
// en
assignedTo: (name: string) => `Assigned to ${name}`,
// fr
assignedTo: (name) => `Assigné à ${name}`,
```

Counts go through `plural`, which picks the form and formats the number ("#"):

```ts
const p = pluralizer("en"); // "fr" in the French file
reports: (count: number) => p(count, { one: "# report", other: "# reports" }),
```

French reads 0 as singular ("0 signalement"); English does not ("0 reports"). Dates and numbers go through `useI18n().date(...)` and `.number(...)`, never `toLocaleString("en")`.

Error messages from the server are in `messages/*/errors.ts`. Throw them with their key: `new InvalidInput(localized("titleRequired"))`. The REST API and MCP send the English text; the dashboard and public pages show the reader's.

A server function's input that fails its zod validation reaches the browser as one sentence in the page's language (`common.validation`: required, too short, too long, invalid email or address, else a generic sentence), through the serialization adapter in `src/start.ts`.

`tests/untranslated-jsx.test.ts` fails when a component has English text written straight into its JSX.

## Add a language

1. Add its code to `LOCALES` and its name, in its own words, to `LOCALE_NAMES` in `locales.ts`.
2. Copy `messages/fr/` to `messages/<code>/`, translate every file, and add the catalogue to `CATALOGUES` in `index.ts`. The typecheck lists everything left.
3. Add the language to the widget's and the SDK's catalogues if you want them to match.
4. Run `pnpm test`: `tests/i18n.test.ts` checks every catalogue has the same keys.

## French glossary

Use "vous", and write French as a French product would, not word for word. Keep these terms the same everywhere:

| English | French |
| --- | --- |
| Triage | Triage |
| Issue | Ticket |
| Bug | Bug |
| Feature request | Demande |
| Report | Signalement |
| Reporter | Auteur du signalement (auteur when short) |
| Backlog, Todo, In progress, In review, Done, Declined, Duplicate | Backlog, À faire, En cours, En revue, Terminé, Écarté, Doublon |
| Priority: urgent, high, medium, low, none | Priorité : urgente, haute, moyenne, basse, sans priorité |
| Assignee / assign | Personne assignée / assigner |
| Label | Étiquette |
| Merge (duplicates) | Fusionner |
| Release | Version |
| Regression | Régression |
| Project, workspace | Projet, espace de travail |
| Owner, admin, member | Propriétaire, admin, membre |
| Overview | Vue d'ensemble |
| Settings | Paramètres |
| Public feature requests (portal) | Demandes publiques |
| Shipped | Disponible |
| Webhook, agent, API token | Webhook, agent, jeton d'API |
| Sign in, sign out | Se connecter, se déconnecter |
| Comment (internal) | Commentaire |
| Conversation with the reporter | Conversation |
