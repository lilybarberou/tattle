# Translating Tattle

The server app (`apps/web`) speaks English and French: the dashboard, the sign-in pages, the public pages (portal, reporter thread, unsubscribe), the emails and the Discord and Slack messages. The widget (`packages/widget/src/i18n.ts`) and the React Native SDK (`packages/react-native/src/i18n.ts`) have their own, smaller catalogues.

What stays in English on purpose: MCP tool names and descriptions, webhook payloads, REST API errors, logs. Agents and integrations read them, and they must not change with someone's language.

## How the language is chosen

| Surface | Language |
| --- | --- |
| Dashboard | The person's choice under their name → **Language** (Auto, English, Français). Auto follows the browser (`Accept-Language`), else English. |
| Sign-in, password reset, onboarding, OAuth consent | The browser's language (the person's choice once signed in). |
| Public pages: portal, reporter thread, unsubscribe | The visitor's browser language, else English. |
| Team emails (assigned, regression, digest, a reporter answered, AI key, webhook failing, password reset) | The recipient's choice; on Auto, the language their browser last asked for; else English. |
| Invitations | The inviter's dashboard language. |
| Reporter emails (team reply, "shipped" notice) | The report's language, from the device language the widget or SDK sends. |
| Portal voters' "shipped" notice | The visitor's browser language when they left their email. |
| Discord and Slack | Project settings → **Discord and Slack** → Language. English by default. |

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
