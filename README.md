# 🎓 Lumi AI — Your AI Study Assistant

**An AI tutoring platform that helps students learn from their own course materials.**

🔗 **Live:** [studywithlumi.com](https://studywithlumi.com) · 👥 **55+ active students**

Lumi AI lets students upload their class materials, then study with an AI tutor
grounded in *their* content — answering questions, generating quizzes and
flashcards, and scheduling spaced-repetition review, all scoped to the documents
they uploaded.

![Lumi AI interface](docs/screenshot-main.png)

## ✨ Features

- **Document-grounded AI chat** — answers come from the student's own uploaded materials
- **Auto-generated quizzes & flashcards** from selected files
- **Spaced-repetition review** — SM-2 scheduling with ease factors, intervals, and due dates
- **Voice mode** — hands-free spoken study via the Web Speech API
- **Class organization** — upload and organize materials per class
- **Admin panel** — user analytics, account management, support triage, feature kill-switch

![Lumi AI study tools](docs/screenshot-quiz.png)

## 🏗️ Tech Stack

**Frontend:** React 18, TypeScript, Vite, Tailwind CSS, Framer Motion
**Backend & Data:** Supabase (PostgreSQL with Row-Level Security, Auth, Storage)
**AI:** Anthropic Claude, called via a **Vercel serverless function** that verifies each caller's token so the API key never reaches the client
**Auth:** Supabase Auth (Google OAuth)
**Hosting:** Vercel (frontend + serverless), custom domain

## 🔒 Security Architecture

- **Row-Level Security** on every table — users can only access their own data
- **Server-side AI** — Claude is only reachable through a serverless function that verifies a valid Supabase token; anonymous calls are rejected, and the API key is never bundled into the client
- **Hardened RPCs** — privileged operations use `SECURITY DEFINER` functions with restricted search paths and execute grants

## 📚 Full Technical Documentation

For complete architecture, data model, AI flow, and deployment detail, see
[`docs/OVERVIEW.md`](docs/OVERVIEW.md).

## 🧑‍💻 What I Built

Solo-designed, built, deployed, and operate the entire platform end-to-end —
frontend, authentication, database, file storage, AI integration, serverless
backend, and production hosting. Currently serving 55+ active student users.

## 📫 Contact

Phanidhar Akula · [LinkedIn](https://linkedin.com/in/phanidharakula) ·
[phanidhar.dev](https://phanidhar.dev) · phanidharakula@gmail.com
