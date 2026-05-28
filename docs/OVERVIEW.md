# Lumi AI — Complete Project Overview

> **One doc, full context.** Everything about Lumi AI — what it is, every feature, how it
> works, the data model, how to run it, and how it's deployed. If you read one file to
> understand this project, read this one.

**Live:** [studywithlumi.com](https://studywithlumi.com) · **Status:** in production, solo‑built and operated.

---

## Table of Contents

1. [What Lumi AI Is](#1-what-lumi-ai-is)
2. [Tech Stack](#2-tech-stack)
3. [Architecture](#3-architecture)
4. [Features](#4-features)
5. [How to Use It (User Guide)](#5-how-to-use-it-user-guide)
6. [The AI Integration](#6-the-ai-integration)
7. [Data Model](#7-data-model)
8. [Routes & Navigation](#8-routes--navigation)
9. [Project Structure](#9-project-structure)
10. [Design System](#10-design-system)
11. [Configuration & Environment](#11-configuration--environment)
12. [Local Development](#12-local-development)
13. [Deployment](#13-deployment)
14. [Security & Privacy](#14-security--privacy)
15. [Database Migrations](#15-database-migrations)
16. [Conventions & Gotchas](#16-conventions--gotchas)

---

## 1. What Lumi AI Is

**Lumi AI is an AI study assistant.** Students upload their own course materials
(PDFs, notes, images), organize them by **class**, and then study with an AI tutor
that is **grounded in their specific documents** — not the open web. From those
materials they can:

- **Chat** with an AI tutor that answers using their uploaded content
- Generate **quizzes** and **flashcards** automatically
- Review flashcards with **spaced repetition** (SM‑2 scheduling)
- Have a **spoken** (voice) conversation with the tutor
- Keep **notes** and a searchable **conversation history**

The product is intentionally simple and friendly: a warm cream‑and‑sage visual
identity, a single dashboard, and AI features that "just work" without the student
ever needing to know which AI provider powers them.

There is also an **admin panel** for the operator (user analytics, account
management, support‑ticket triage, and a feature kill‑switch).

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18 + Vite 7, React Router 6, code‑split lazy routes |
| **Language** | JavaScript + TypeScript (incremental; `allowJs`, `tsc --noEmit` for type‑checking) |
| **Styling** | Tailwind CSS v4 (utilities/theme only, no preflight) + hand‑written component CSS; "Winky Sans" font |
| **Animation** | Framer Motion |
| **Auth** | Supabase Auth (Google OAuth 2.0) |
| **Database** | Supabase PostgreSQL with Row‑Level Security (RLS) |
| **File storage** | Supabase Storage (private `files` bucket) |
| **AI** | **Anthropic Claude** via the official `@anthropic-ai/sdk` |
| **AI endpoint** | **Vercel serverless function** (`api/chat.ts`) — keeps the API key server‑side |
| **PDF text** | `pdfjs-dist` (worker loaded from CDN) |
| **Voice** | Browser‑native Web Speech API (`SpeechRecognition` + `SpeechSynthesis`) |
| **Markdown/code** | `react-markdown` + `remark-gfm` + `rehype-highlight` (highlight.js) |
| **Hosting** | Vercel (frontend + serverless), Supabase (data/auth/storage) |
| **Domains** | `www.studywithlumi.com` (app), `api.studywithlumi.com` (Supabase custom domain) |

> **Note on history:** an earlier version of this project used OpenAI through a
> Supabase Edge Function. It has since been migrated to **Anthropic Claude through a
> Vercel serverless function**. The repo `README.md` still reflects the old setup and
> should be treated as out of date relative to this document.

---

## 3. Architecture

```
                         ┌─────────────────────────────┐
                         │         Browser (SPA)        │
                         │  React + Vite, React Router  │
                         └───────────────┬─────────────┘
                                         │
         ┌───────────────────────────────┼──────────────────────────────┐
         │ (1) auth, DB, storage          │ (2) AI chat                   │
         ▼  Supabase JS client            ▼  fetch + Bearer token         │
┌────────────────────────┐      ┌──────────────────────────┐            │
│   Supabase              │      │  Vercel Serverless        │            │
│  • Postgres (RLS)       │      │  api/chat.ts              │            │
│  • Auth (Google OAuth)  │◄─────┤  • verifies the caller's  │            │
│  • Storage (files)      │ token│    Supabase token         │            │
│  • SECURITY DEFINER RPCs│ check│  • calls Claude           │            │
└────────────────────────┘      └────────────┬─────────────┘            │
                                              │  ANTHROPIC_API_KEY        │
                                              ▼  (server‑only)            │
                                   ┌──────────────────────┐               │
                                   │  Anthropic Claude API │               │
                                   └──────────────────────┘               │
```

**Two independent back‑end paths:**

1. **Data path** — the browser talks to Supabase directly using the public anon key.
   Every table is protected by Row‑Level Security, so a user can only ever read/write
   their own rows. Privileged operations (admin stats, account deletion, region
   capture) go through `SECURITY DEFINER` RPC functions that enforce their own checks.

2. **AI path** — the browser never talks to Claude directly. It calls the Vercel
   function `api/chat.ts` with the user's Supabase access token. The function
   **verifies the token** (rejecting anonymous callers) and only then calls Claude
   using the server‑only `ANTHROPIC_API_KEY`. The key is never shipped to the browser.

In local development, Vite serves `api/chat` itself (via a small dev middleware in
`vite.config.js`), so the AI works without running `vercel dev`.

---

## 4. Features

### 4.1 Accounts & Auth
- **Sign in with Google** only (no passwords). Handled by Supabase Auth.
  `src/pages/auth/Login.jsx` starts the OAuth flow; `src/pages/auth/AuthRedirect.jsx`
  is the `/auth/callback` handler that finalizes the session and routes to the dashboard.
- **Profile auto‑creation** — a database trigger creates a `profiles` row on first sign‑in.
- **Region capture** — on login the client detects the user's region from their browser
  timezone (`src/utils/region.ts`) and stores it via the `set_my_region` RPC (only fills
  it if not already set). Used for admin analytics.
- **Self‑service account deletion** — from the dashboard menu; permanently removes all of
  the user's data (`user_delete_own_account` RPC). Can be globally disabled by the admin.

### 4.2 Classes
The top‑level way to organize study material. Create / rename / delete classes
(`src/components/AddClassForm.jsx`, `src/components/ClassDetails.jsx`). Deleting a class
cascades to its files, conversations, quizzes, and flashcards.

### 4.3 File Uploads
Upload study materials into a class (`ClassDetails`). Files are stored in a **private
Supabase Storage bucket**; metadata lives in the `files` table. **PDF text is extracted
in the browser** with `pdfjs-dist` so it can be fed to the AI as context. Images can be
attached to chat and sent to Claude as well.

### 4.4 AI Chat (the core feature)
A chat tutor grounded in the student's materials. The user picks which classes/files to
include as context, asks a question, and Claude answers using that content. Conversations
are saved (with an AI‑generated title) and can be revisited from a history sidebar.
See [The AI Integration](#6-the-ai-integration) for the full flow.

### 4.5 Quizzes
Auto‑generates a multiple‑choice quiz from selected files (`src/components/QuizComponent.jsx`).
The student picks files / difficulty / count, takes the quiz, and gets scored with a
per‑question review. Completed quizzes are saved to `quiz_history` and can be retaken.

### 4.6 Flashcards
Auto‑generates a deck of cards (`{ front, back, category }`) from selected files
(`src/components/FlashcardsComponent.jsx`). Supports a few **card styles**
(`standard`, `definition`, `qa`). Decks are saved to `flashcard_history`.

### 4.7 Spaced Repetition / Review
A dedicated **Review** page (`src/pages/Review.jsx`, `/review`) that schedules flashcards
across all decks using a lightweight **SM‑2** algorithm (`src/services/reviewService.ts`):

- Each card tracks an **ease** factor, an **interval**, repetition count, and a **due date**
  (table `flashcard_srs`).
- The review queue shows **due cards first** (oldest due first), then up to **20 new cards**.
- The student reveals the answer and rates recall: **Again / Hard / Good / Easy**, which
  reschedules the card (Again resurfaces it in the same session; Good/Easy push it further out).
- The **dashboard shows a red "due" badge** so students have a reason to return daily.

### 4.8 Notes
Lightweight per‑class notes with tags (`notes` table).

### 4.9 Talk / Voice Mode
A hands‑free spoken conversation with the tutor (`src/components/TalkComponent.jsx`). Uses the
browser's **Web Speech API**: `SpeechRecognition` to transcribe the student's speech and
`SpeechSynthesis` to speak Claude's reply. Responses use a shorter, plain‑spoken system prompt
(no markdown). The chosen voice is remembered in `localStorage`.

### 4.10 Support Tickets
In‑app support (`src/pages/Support.jsx`, `/support`). Students submit a ticket
(topic + subject + message) and see the status of their past tickets (Open / In progress /
Resolved). Stored in `support_tickets`; backed by the real `support@studywithlumi.com` inbox.

### 4.11 Admin Panel
Operator‑only (`src/pages/Admin.jsx`, `/admin`, gated by `profiles.is_admin`):
- **User analytics** — every user with class/file/storage counts and join date
  (`admin_get_user_stats` RPC), searchable and filterable by region and date.
- **Account management** — delete any user (`admin_delete_user` RPC).
- **Support triage** — list all tickets, filter by status, and update status; each ticket
  has a `mailto:` link to reply from the support inbox.
- **Settings** — a toggle to enable/disable self‑service account deletion app‑wide
  (`app_settings`).

---

## 5. How to Use It (User Guide)

1. **Sign in** — go to the site, click **Continue with Google**.
2. **Create a class** — on the dashboard, add a class (e.g. "Biology 101").
3. **Upload materials** — open the class and upload your PDFs / documents.
4. **Chat** — open chat, select the class/files to use as context, and ask questions.
   Lumi answers from *your* materials. Past chats are saved in the history sidebar.
5. **Generate study aids** — from a class, generate a **quiz** or a **flashcard deck**
   from the selected files.
6. **Review daily** — open **Review** (dashboard menu; shows a badge with how many cards
   are due) and rate each card. Spaced repetition brings cards back right before you'd forget.
7. **Talk** — open **Talk** for a spoken, hands‑free study session.
8. **Need help?** — use **Support** in the menu to send a message; you'll get a reply by email.

---

## 6. The AI Integration

**Files:** `api/chat.ts` (server), `src/services/aiService.ts` (client),
`src/components/ChatComponent.jsx` + `ChatMessage.jsx` + `ChatInput.jsx` (UI).

**End‑to‑end flow of one message:**

1. The user sends a message. `aiService.ts` assembles the request: a **system prompt**
   (Lumi's "brilliant tutor" persona), the **conversation history**, the new user message,
   and — when selected — the **study‑materials context** (text extracted from the class's
   files) and any attached images.
2. The client `POST`s to **`/api/chat`** with the user's Supabase access token in the
   `Authorization: Bearer …` header.
3. `api/chat.ts` **verifies the token** against Supabase (`/auth/v1/user`). Anonymous or
   invalid callers get `401` — this prevents anyone from spending AI credits.
4. The function calls **Claude** with the model from `ANTHROPIC_MODEL`
   (default **`claude-opus-4-7`**). The system prompt is marked with
   `cache_control: ephemeral` to use Anthropic's prompt cache (lower latency/cost).
5. The reply **streams back** to the client and renders as markdown (with syntax
   highlighting for code).
6. The Q&A is saved to `conversations` with an AI‑generated **title** and a **session** id
   that groups turns within a chat window.

**Never reveal the provider.** All AI errors are mapped to friendly, on‑brand copy and the
real error is logged server‑side only:

| Condition | What the user sees |
|---|---|
| Rate‑limit / overload / **out of credits** (429/503/529) | "Lumi is a little busy right now…" |
| Missing/invalid auth | "Please sign in to use Lumi." |
| Any other failure | "Lumi couldn't respond just now…" |

The words "Anthropic," "Claude," "API key," "credits," or "billing" are never surfaced to users.

---

## 7. Data Model

All tables use **Row‑Level Security**. The standard policy is `user_id = auth.uid()`
(a user only sees their own rows). Admin access is granted by
`EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin)`.

| Table | Purpose | Key columns |
|---|---|---|
| `profiles` | One row per user | `id` (=auth user), `email`, `full_name`, `avatar_url`, `region`, `is_admin`, `metadata` |
| `classes` | Study‑material folders | `id`, `user_id`, `name`, `description` |
| `files` | Uploaded file metadata (blobs in Storage) | `id`, `user_id`, `class_id`, `name`, `size`, `type`, `path` |
| `notes` | Per‑class notes | `id`, `user_id`, `class_id`, `title`, `content`, `tags[]` |
| `conversations` | Saved AI chat turns | `id`, `user_id`, `class_id`, `question`, `answer`, `title`, `session`, context arrays, `messages_metadata` |
| `quiz_history` | Completed quizzes | `id`, `user_id`, `class_id`, `quiz_data`, `user_answers`, `score` (JSONB) |
| `flashcard_history` | Generated decks | `id`, `user_id`, `class_id`, `cards` (JSONB `[{front,back,category}]`), `num_cards`, `card_style`, `source_files[]` |
| `flashcard_srs` | Spaced‑repetition state per card | `user_id`, `deck_id`→`flashcard_history`, `card_index`, `ease`, `interval_days`, `repetitions`, `due_at`, `last_reviewed_at`; UNIQUE(`deck_id`,`card_index`) |
| `support_tickets` | In‑app support | `id`, `user_id`, `email`, `category`, `subject`, `message`, `status` (open/in_progress/resolved) |
| `deleted_accounts` | Tombstones for deleted users | `email`, `deleted_by`, `deleted_at`, `reason`; locked down (no user access) |
| `app_settings` | Operator feature flags | `key`, `value` (e.g. `account_deletion_enabled`) |
| `auth_error_log` | Auth error diagnostics | admin‑read only |

**`SECURITY DEFINER` RPC functions** (run with elevated rights but enforce their own checks;
hardened with `SET search_path = ''` and execute grants restricted to the right roles):

| Function | Who | What it does |
|---|---|---|
| `admin_get_user_stats()` | admins | Returns all users + class/file/storage counts |
| `admin_delete_user(target_user_id)` | admins | Deletes a user and all their data; records a tombstone |
| `user_delete_own_account()` | any user | Deletes the caller's own account + data |
| `set_my_region(region)` | any user | Sets the caller's region if not already set |
| `handle_new_user_safe` (trigger) | system | Creates a `profiles` row on signup, including region |

---

## 8. Routes & Navigation

| Route | Page | Access |
|---|---|---|
| `/` | `WelcomePage` (landing) — redirects to `/dashboard` if signed in | public |
| `/login` | `Login` (Google button) | public |
| `/auth/callback` | `AuthRedirect` (finalizes OAuth) | public |
| `/dashboard` | `Dashboard` (classes, uploads, chat/talk/quiz/flashcard overlays) | **protected** |
| `/review` | `Review` (spaced‑repetition flashcards) | **protected** |
| `/support` | `Support` (ticket form + history) | **protected** |
| `/admin` | `Admin` (operator panel) | **protected + `is_admin`** |
| `/privacy` | `PrivacyPage` | public (required for OAuth verification) |
| `/terms` | `TermsPage` | public |
| `/chat/:classId?` | legacy → redirects to `/dashboard?chat=true` | — |

Protected routes are wrapped by `src/components/ProtectedRoute.tsx`, which redirects to
`/login` when there's no session. Navigation between screens is via the **dashboard menu**
(Review, Support, Admin if applicable, Sign out, Delete account) and back buttons on each overlay/page.

---

## 9. Project Structure

```
.
├── api/
│   └── chat.ts                  # Vercel serverless: auth‑checks caller, calls Claude
├── docs/
│   └── OVERVIEW.md              # ← this file
├── public/                      # static assets served at site root
│   ├── favicon.svg / favicon-32.png / apple-touch-icon.png / og-image.png
├── src/
│   ├── main.jsx                 # React entry (BrowserRouter + future flags)
│   ├── App.jsx                  # Routes (lazy‑loaded)
│   ├── App.css / index.css      # global styles + Tailwind + design tokens
│   ├── lib/
│   │   └── supabaseClient.ts    # Supabase client (uses VITE_SUPABASE_* env)
│   ├── utils/
│   │   ├── region.ts            # browser timezone → region
│   │   └── storageUtils.ts      # signed/public file URLs
│   ├── services/
│   │   ├── aiService.ts         # chat request building + streaming + system prompts
│   │   ├── reviewService.ts     # SM‑2 spaced repetition (queue, scheduling)
│   │   └── supportService.ts    # support‑ticket CRUD (user + admin)
│   ├── components/              # each paired with a .css file
│   │   ├── ChatComponent / ChatInput / ChatMessage   # AI chat UI
│   │   ├── ClassDetails / AddClassForm               # classes + file upload
│   │   ├── QuizComponent / FlashcardsComponent       # study‑aid generators
│   │   ├── TalkComponent                             # voice mode
│   │   ├── FileViewer / ContextTags / TagSelector    # file view + context picker
│   │   ├── ConfirmDialog.tsx                         # shared confirm modal
│   │   ├── ProtectedRoute.tsx                        # auth route guard
│   │   └── LazyLottie.tsx                            # deferred Lottie loader
│   ├── pages/
│   │   ├── Dashboard / Admin / Review / Support      # main screens
│   │   ├── WelcomePage / PrivacyPage / TermsPage     # public pages
│   │   └── auth/ (Login, AuthRedirect, Auth.css)     # auth flow
│   ├── assets/                  # Lottie JSON (books, brain, notes, google)
│   └── scripts/                 # Supabase SQL migrations 00–27 (run manually)
├── index.html                   # favicons, OG/Twitter meta, theme color
├── vite.config.js               # build, chunk‑splitting, dev /api proxy
├── vercel.json                  # SPA rewrites, security headers, asset caching
└── package.json
```

---

## 10. Design System

A warm, friendly, slightly "sticker‑like" look. Tokens live in `src/App.css` (`:root`) and
`src/index.css` (Tailwind `@theme`).

| Token | Value | Use |
|---|---|---|
| `--background-primary-color` | `#F0EBE1` (cream) | page background |
| `--background-secondary-color` | `#93C1C1` (sage) | accents, buttons, tags |
| `--text-primary-color` | `#000000` | text, borders |
| `--text-secondary-color` | `#707070` | muted text |
| Font | **"Winky Sans"** (Google Fonts) | everything; base weight 300, letter‑spacing 1px |

**Signature style:** 1.5px solid black borders + a **hard offset drop shadow**
(`box-shadow: 0px 2–3px 0 black`) that gives controls a tactile, lifted "sticker" feel.
Buttons are pill‑shaped; cards are rounded with the hard shadow. Animations use Framer Motion
springs (hover lift, tap scale).

> **CSS convention:** new screens namespace their classes (e.g. `.support-*`, `.review-*`)
> and avoid `!important` so styles never leak or conflict across the app.

---

## 11. Configuration & Environment

**Client (safe to expose — Vite inlines `VITE_*` into the bundle):**

| Var | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Supabase API URL (currently the custom domain `https://api.studywithlumi.com`) |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key — public by design; access is gated by RLS |

**Server‑only (never sent to the browser — set in Vercel project settings):**

| Var | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Claude API key (no `VITE_` prefix → never bundled) |
| `ANTHROPIC_MODEL` | Optional; defaults to `claude-opus-4-7` |

`api/chat.ts` also reads the Supabase URL + anon key (server side) to verify caller tokens.

> ⚠️ `VITE_*` variables are **baked in at build time**. Changing one in Vercel requires a
> **redeploy** to take effect — and browsers cache the bundle, so a hard refresh may be needed.

---

## 12. Local Development

```bash
# 1. install
npm install

# 2. create .env.local with your real values
VITE_SUPABASE_URL=...           # Supabase URL (or the custom domain)
VITE_SUPABASE_ANON_KEY=...      # Supabase anon key
ANTHROPIC_API_KEY=...           # Claude key (server-only; read by the dev /api proxy)
ANTHROPIC_MODEL=claude-opus-4-7 # optional

# 3. run (Vite also serves /api/chat locally)
npm run dev        # http://localhost:5173

# quality gates
npm run typecheck  # tsc --noEmit
npm run lint       # eslint .
npm run build      # production build → dist/
```

**Database:** the SQL migrations in `src/scripts/` are run **manually in the Supabase SQL
editor**, in order. They are **additive** (safe to run on the production database) — new
features ship with a new numbered migration that must be applied before the feature works.

---

## 13. Deployment

- **Hosting:** Vercel. Pushing to the **production branch (`MVP`)** auto‑deploys to
  production; Vercel runs `npm run build` and serves `dist/` as an SPA, with `/api/*`
  handled by serverless functions.
- **`vercel.json`:** SPA rewrite (`/((?!api/).*) → /index.html`), security headers
  (`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy:
  same-origin`), and long‑lived immutable caching for `/assets/*`.
- **Domains:** `www.studywithlumi.com` (app) and `api.studywithlumi.com` (a Supabase
  custom domain fronting the Supabase project). Google OAuth's authorized redirect is the
  Supabase `…/auth/v1/callback` on whichever host `VITE_SUPABASE_URL` points to.
- **Release checklist for a new feature:** apply its SQL migration in Supabase → merge to
  `MVP` (auto‑deploys) → verify on `www`.

---

## 14. Security & Privacy

- **RLS everywhere** — users can only access their own rows; admin reach is gated by an
  `is_admin` check. Privileged actions go through hardened `SECURITY DEFINER` RPCs.
- **AI key never leaks** — `ANTHROPIC_API_KEY` has no `VITE_` prefix, so it's never in the
  client bundle. Claude is only reachable through `api/chat.ts`, which **requires a valid
  signed‑in Supabase token** (anonymous calls get `401`).
- **Provider is invisible to users** — all AI errors map to friendly copy; the provider,
  key, credits, and billing are never exposed.
- **Account deletion** — users can delete their own account and all data; a tombstone is
  recorded. Admins can delete any account.
- **Legal** — public `/privacy` and `/terms` pages; the Google OAuth consent screen is
  verified, with a branded logo and `support@studywithlumi.com` as the contact.
- **Hardening migrations** (`23`, `25`) lock down table RLS, set safe function search paths,
  and restrict execute grants.

---

## 15. Database Migrations

Run in order in the Supabase SQL editor. All additive.

| # | File | What it adds |
|---|---|---|
| 00 | `create_profiles_table` | `profiles` + signup trigger |
| 01 | `backfill_profiles` | backfill existing users |
| 02 | `create_classes_table` | `classes` |
| 03 | `create_files_table` | `files` |
| 04 | `create_notes_table` | `notes` |
| 05–08 | `conversations` (+ title, session, metadata) | chat history |
| 09 | `setup_storage_policies` | Storage RLS for the `files` bucket |
| 10 | `create_quiz_history_table` | `quiz_history` |
| 11 | `create_flashcard_history_table` | `flashcard_history` |
| 12 | `deleted_accounts_table` | deletion tombstones |
| 13 | `add_region_to_profiles` | `profiles.region` |
| 14 | `handle_new_user_safe` | safer signup trigger (captures region) |
| 15 | `set_my_region` | per‑user region RPC |
| 16 | `populate_existing_user_regions` | backfill regions |
| 17 | `add_is_admin_to_profiles` | `profiles.is_admin` |
| 18 | `admin_list_auth_users` | (superseded — dropped in 23) |
| 19 | `admin_get_user_stats` | admin analytics RPC |
| 20 | `admin_delete_user` | admin deletion RPC |
| 21 | `user_delete_own_account` | self‑service deletion RPC |
| 22 | `account_deletion_toggle` | `app_settings` + kill‑switch |
| 23 | `security_hardening` | RLS lockdowns, drop unused RPC |
| 24 | `auth_error_log_admin_read` | admin‑only read on auth error log |
| 25 | `function_hardening` | `search_path=''` + execute‑grant restrictions |
| 26 | `create_support_tickets_table` | `support_tickets` |
| 27 | `create_flashcard_srs_table` | `flashcard_srs` (spaced repetition) |

---

## 16. Conventions & Gotchas

- **Branch model:** work happens directly on **`MVP`** (the production branch); changes are
  batched and committed deliberately, since a push deploys to production.
- **Migrations are manual + additive.** A new feature isn't "done" until its SQL migration is
  applied in Supabase. Never write destructive migrations against production data.
- **`VITE_*` env changes need a redeploy** (build‑time inlined) and possibly a hard refresh
  (browser caches the bundle).
- **Design language is fixed:** cream `#f0ebe1`, sage `#93c1c1`, "Winky Sans", hard offset
  shadows. New UI should match it and **namespace its CSS** to avoid cross‑screen conflicts.
- **WebKit/Safari note:** a hard `box-shadow` on an element that shrinks or unmounts in a
  vacated area can leave a paint "ghost" until a full window recomposite. Avoid hard shadows
  on elements that reposition (see the Review page's flat action buttons).
- **The repo `README.md` is marketing‑level and out of date** (it references OpenAI + a
  Supabase Edge Function). This document is the accurate technical source of truth.

---

*Maintained by Phanidhar Akula. Support: support@studywithlumi.com.*
