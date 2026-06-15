# Mobile QA Checklist (iPhone SE 3 · iPhone 17 Pro Max · Desktop)

Going screen by screen to verify and fix responsive + touch issues, on the real
devices via the cloudflared tunnel (HMR live).

Legend: `[x]` verified good · `[~]` fixed, awaiting re-check · `[ ]` not yet reviewed

## Public / pre-auth
- [x] Welcome page (`WelcomePage`)
- [x] Login page (`Login`) — all views
- [~] Privacy / Terms (`LegalLayout`) — reduced top padding above the back button; scroll-to-top on open
- [ ] Maintenance screen (`MaintenanceScreen`)
- [ ] In-app browser gate (`OpenInBrowser`)
- [ ] Sign-in redirect loader (`AuthRedirect`)

## Signed-in
- [~] Dashboard (`Dashboard`) — added bottom gap so cards clear the AI dock; full pass pending
- [ ] Class details (`ClassDetails`)
- [ ] File viewer (`FileViewer`)
- [ ] Chat with AI (`ChatComponent`, `ChatInput`, `ChatMessage`, `ContextTags`, `TagSelector`)
- [ ] Talk with AI (`TalkComponent`)
- [ ] Quiz (`QuizComponent`)
- [ ] Flashcards (`FlashcardsComponent`)
- [ ] Review (`Review`)
- [ ] Progress (`Progress`)
- [ ] Support (`Support`)
- [ ] Admin (`Admin`, `AdminAnalytics`)

## Shared components
- [~] Create / rename class (`AddClassForm`) — top-anchored on phones so the keyboard doesn't bury it
- [ ] Confirm dialog (`ConfirmDialog`)
- [ ] Modal primitive (`Modal`)
- [~] Controls — Back / Close / Icon buttons enlarged to 44px touch targets on phones
- [ ] Select dropdown (`Select`)
- [ ] History dropdown (`HistoryDropdown`)
- [ ] Generating state (`GeneratingState`)
- [ ] File selection card (`FileSelectionCard`)

## Cross-cutting
- [~] Scroll-to-top on route change — instant + lazy-route safe (was leaving privacy/terms at prior scroll)
- [~] Touch target sizes — back/close buttons → 44px on phones
- [ ] Bottom AI dock overlap on other signed-in screens that show the dock
