# Imara Afya — feature inventory

Generated from the code on 6 August 2026. **54 GraphQL operations**, 11 screens,
4 languages.

A general health companion — no religious features, open to anyone.

Status:

- **Live** — backend and app both done, usable today
- **Backend only** — built and type-safe, but no screen calls it
- **Not built** — neither side exists

---

## 1. Account and profile — Live

Sign up and log in (email + password, bcrypt). Profile with name, photo, height,
weight, gender. Sliding 7-day session, silently renewed, with the password
required again after 30 days. Logout retires every token the account issued.
Account deletion wipes all owned records first. Timezone pushed from the phone
on launch. Metric / imperial display.

## 2. Change password — Live

Current password, new password, confirm. **After five wrong attempts** the
backend stops accepting guesses and the app offers the email reset instead —
someone who can't remember it won't remember it on the sixth try. A correct
password clears the counter. The reset link is also always available, so nobody
has to fail five times to find it.

Mismatched confirmation is caught before an attempt is spent.

*Email delivery still has no provider connected — the reset flow works but the
message doesn't send.*

## 3. Health records — Live

Conditions, allergies and medications with notes. Add, edit, delete.
*Attachments are backend only.*

## 4. Medications and dose tracking — Live

Medicines with dosage, schedule times and pause/resume. **Each scheduled time is
its own dose** — a medicine at 08:00 and 20:00 is two independent ticks. Undo a
mis-tap. Adherence progress. Doses land on the user's own calendar day, so one
logged at 00:30 isn't filed under yesterday.

*Reminders for specific medicines are not built — see section 8.*

## 5. Period cycle — Live *(women only)*

Log, edit and delete periods. Predicts the next period and fertile window with a
confidence level, asks whether cycles are regular, and flags genuinely irregular
patterns as worth raising with a clinician. Calendar, chart, history.

## 6. Pregnancy tracker — Backend only

Start, update, end; week-by-week progress; history. Six operations, no screens.

## 7. Daily habits — Live

Water with goal and streak, sleep hours, weight with BMI, seven-day sparkline.

## 8. Daily reminders — Live

Two local notifications, scheduled on the device so they fire with no network,
no server and no signal:

- **Water** at 09:00, 13:00, 17:00 and 20:00 — deliberately not hourly, because
  a reminder that arrives eight times a day gets muted
- **A warm daily message** at 10:30 — "take a moment for yourself"

Toggle in More. Android notification channel so they're controllable in system
settings. Rescheduled when the language changes, since the text is baked in when
scheduled. Explains itself when the OS has blocked notifications instead of
silently failing.

*Per-medicine reminders are still not built.*

## 9. Check-in — Live

Mood and energy 1–5 with a note, up to 10 a day, streak, rolling averages and a
trend chart in the app.

## 10. Daily routines — Backend only

User-defined recurring things with days of the week, ordering, archiving and a
streak that only counts days the routine was actually due.

## 11. Guidance content — Live *(backend)*

Medical health guidance, four categories, four languages, admin-published. The
More menu still shows it as "Coming soon".

## 12. App-wide

Four languages (English, Kiswahili, Français, Ikirundi) at 289 keys each, in
parity. Dark mode with two palettes. Left-edge swipe-back on both platforms.
Liquid Glass on iOS 26. Fade-ins, collapsing headers, rotating dashboard banner.
One round trip per screen.

## 13. Security

Rate limiting per IP and per operation. Login throttled per account. bcrypt
compare runs even for unknown emails so timing can't reveal who has an account.
JWT algorithm and issuer pinned. Token revocation via `tokenVersion`. 30-day
session cap. Query depth limit. Introspection off in production. CORS locked.
Every user-owned query filtered by owner. Server-side validation. Row caps on
every list query.

---

## Removed in this version

Prayer times, Ramadan mode, Find care / the hospital directory, and the religion
field — along with the Google Maps configuration and the location permission,
which existed only for Find care.

## Summary

| Status | Features |
|---|---|
| **Live** | Account, change password, records, medications, cycle, habits, check-in, reminders, guidance |
| **Backend only** | Pregnancy, routines, record attachments, password reset UI |
| **Not built** | Per-medicine reminders, insights, steps |
