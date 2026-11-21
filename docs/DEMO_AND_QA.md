# Demo script and judge Q&A

## Before the demo (10 minutes)

1. Stop any running server, then reset to clean demo data:
   `npm run db:reset` then `npm run build && npm start` (or `npm run dev`).
2. If you have a key, put `ANTHROPIC_API_KEY=...` in `.env.local` before starting. The review screen then runs Claude live.
3. Open three browser windows (use a private window for the second and third so the sessions stay separate):
   - **Resident:** narrow the window to phone width (or use the browser's device toolbar). Sign in as **Asha** (`asha@civicops.demo`).
   - **Officer:** sign in as **Rahul** (`kw.officer@civicops.demo`).
   - **Super admin:** sign in as **Priya** (`admin@civicops.demo`).
   - Password for all: `CivicOps@2026` (one-click buttons on the sign-in page).
4. In a fourth tab, preload `http://localhost:3000/accountability/work-orders/WO25-01590`.
5. Keep `docs/qa/video/` and the screenshots in `docs/qa/` ready as a backup.

Laptop GPS at the venue would place the report in the wrong ward, so the script uses **locality search**. That also shows the denied-GPS path.

## Three-minute script

**0:00 · The problem (one sentence).** "When a Mumbai road floods, a resident can't see who owns the problem, when it's due, or whether the fix was real. And the city can't easily see where its repair money went."

**0:15 · Resident reports (phone window).** Tap **Report an issue** → **Waterlogging**. Answer *Knee deep*, *Rising*, *Ambulance or fire access blocked*. Type: "Flooded near the church on Juhu Tara Road, ambulance can't pass". On **Where is it?**, search **Juhu** and pick it. Point at the card: **Ward K/W · Storm Water Drains · Red · Critical: first action within 5 hours.** Skip or add a photo → **Send report**. The tracking ID appears at once.

**0:55 · Officer acts (officer window).** **My ward** lists tickets by the deadline that applies now. The new ticket sits in *New & assigned* near the top, with its red first-action clock (only already-overdue tickets come before it). Open it → **Record first action**: "Dewatering pump deployed, one lane barricaded" → **Post progress update**: "Water down to ankle level" → **Record: access restored** → add an **after** photo → **Submit completion for review**. "Every step is timestamped in IST with the officer's name."

**1:35 · Super admin verifies (admin window).** **Command centre** shows escalations, evidence awaiting verification, and ward performance. Click **Review evidence** to see before and after side by side, the officer's notes and the access-restored time. Click **Run Claude assessment** (or, without a key: "Claude isn't configured, so we use the manual checklist; Claude never closes a ticket anyway"). Tick the checklist, write the reason → **Approve closure**.

**2:05 · Resident sees the result (phone window).** Refresh: **Green · Verified resolved, 100%**, the original Red priority kept, "deadline met", and the full timeline from report to approval.

**2:20 · Follow the rupee (fourth tab).** Link Road, Juhu, **WO25-01590**:
- Hinglish complaint BMC25-004138: "wahi gadda phir se khul gaya" (the same pothole has opened again).
- Bill **₹23,311** against **₹12,220** reference (4.7 m² × ₹2,600 hot mix) = **1.91×**. Normal jobs stay within 1.3×.
- Target 72 h, took **89 h**. The remark blames rain, but recorded rain was light.
- **Reopened within 30 days.** This segment had 8 repairs this monsoon and 4 failed.
- Click **Next-rupee plan** for K/W: Juhu Tara Road and Link Road rank top, with drain desilting funded instead of more patches, and the DLP segment claimed from the original contractor at no cost.

Close: "Service delivery and accountability in one trail: every complaint has an owner, a deadline and proof. Every rupee has a reason, or a flag."

## Backup walkthrough

- **No live network or server problem:** play the four videos in `docs/qa/video/` (resident, officer, admin, resident). Screenshots are in `docs/qa/01…07`.
- **Seeded tickets** (`db:reset` creates them):
  - A completed **Green** Juhu waterlogging ticket.
  - An escalated **burst pipe in K/E** (first action missed).
  - An overdue **Link Road pothole**.
  - An "Andheri" report sitting in **triage**.
  - **Two tickets awaiting verification:** illegal dumping with matching photos (approve it), and an open manhole whose after-photo shows an indoor room (return it for rework).
  - A **suggested duplicate** of the Lokhandwala missed pickup.

## Judge Q&A (from the brief)

**1. What problem does CivicOps solve?**
A resident can see who owns their issue (ward, department, named officer), when action is due (a live clock: first action within 5 h for red, resolution by day 7 or 10), and what evidence closed it (before/after photos, the officer's notes, the reviewer's recorded decision). Screen: the ticket page, top card.

**2. Flooded road vs fallen tree vs missed pickup?**
- **Questions differ by category:** depth, rising or receding, access blocked / obstruction, wire contact / pickup point, missed date, recurrence.
- **Routing differs:** Storm Water Drains / Gardens & Trees, plus Electrical when wires may be involved / Solid Waste.
- **Priority differs:** blocked emergency access or a major road is red; a wire-contact tree is red; a routine missed pickup is orange standard.
- **Closure evidence differs:** access-restored time plus an after photo of the same stretch / obstruction cleared plus the supporting-team handoff / waste removed from the same point.
- Tests: W waterlogging, W fallen tree, W missed pickup.

**3. How do you know which ward owns an issue?**
- **Location to ward:** the GPS or pin is matched against the 24 ward polygons, and a typed locality against the gazetteer (including Marathi/Hindi aliases).
- **Disagreements:** if the address and pin disagree, the pin is outside all wards, or the text is ambiguous ("Andheri" = K/E or K/W), the resident is asked to confirm or the report goes to the triage queue, with the clock already running.
- **Transfers:** a transfer records from/to owner, actor, time and reason, and keeps the ticket ID, evidence and original deadline.
- Tests: R Juhu / Andheri / conflict / out of bounds; W transfer.

**4. What if the department misses its deadline?**
The scheduler (every minute) writes one history entry, raises the escalation level and notifies the team and super admins. It does this once per threshold, even on retries. Screens: Command centre → Escalation inbox; the ticket timeline shows "Escalated: first-action deadline missed". Test: W scheduler (retry reports nothing new).

**5. Who decides that the issue is fixed?**
Only a super admin, and the database enforces it (a trigger rejects anyone else). The review screen shows the officer's photos and notes, plus Claude's structured assessment: same place, visible changes, verdict, what can't be verified. The admin records approve, request more evidence, or rework, with a reason. Test: W permissions (an officer's raw SQL update is rejected).

**6. What if Claude is wrong or unavailable?**
Claude is advisory. If there's no key, an error, a refusal or unclear images, the panel says so and the manual checklist is used. If Claude says "repaired" but the photo is wrong, the admin can still return it for rework. The earlier decision and the earlier photos stay in the history. Tests: W Claude unavailable; W rework/reopen.

**7. Repeat issues and multiple reports?**
- **At report time:** nearby open reports of the same type (within 250 m) are suggested. The resident can follow one instead, and other residents' identities are never shown.
- **Linking duplicates:** staff confirm before reports are merged. The duplicate's reporter then follows the original and gets its updates.
- **Reopening:** a resident can reopen within 30 days, which starts a new clock and keeps the earlier outcome.
- **History:** recurring problem spots per ward come from 2025 complaints.
- Test: W missed pickup.

**8. How is the repo used, and what changes for a real pilot?**
- **Synthetic history:** all 17 files are imported read-only, labelled synthetic, and kept separate from live tickets (`data_origin`), with the historical SLA kept separate from the new policy.
- **For a real pilot:** official ward boundaries, routing rules and SLA policies are configuration (Rules & SLAs screen, versioned and audited). Hosted Postgres, object storage, SMS/WhatsApp gateways and staff accounts plug in through environment settings.

**9. How can a judge verify the cost accountability feature?**
Open `/accountability/work-orders/WO25-01590` and compare it with the CSVs:
- `work_orders.csv`: cost 23311, area 4.7, Hot mix patch, sla 72 / N, reopened Y.
- `rate_card.csv`: Hot mix patch, 2600 per sqm, so 4.7 × 2600 = 12,220.
- `complaints.csv`: BMC25-004138.
- `roads.csv`: RD0158, Link Road segment 4, not under DLP.

Automated: H "Link Road" asserts these values straight from the CSV files.

**10. What is fully working today?**
Everything in the service flow and accountability flow above, verified by:
- 38 unit and integration tests.
- 9 browser tests on the production build.
- Lint, typecheck and the production build.

Prerequisites or gaps:
- Live Claude Vision needs an API key; the code is written and the manual fallback is tested.
- PostGIS and hosted Postgres are unverified because of the venue network.
- Marathi/Hindi cover the page chrome only.
- No S3 driver yet.

See `docs/COVERAGE.md`.

## Judge Q&A (pitch round)

**How does CivicOps decide which ward and department should act?**
The location sets the ward (polygon, then gazetteer, then triage if unsure). The category plus a ward-specific or city-wide rule sets the department. The report's details add supporting teams: wires → Electrical, blocked emergency access → Disaster Management.

**What changes between a flooded road, a fallen tree, a burst pipe and a missed pickup?**
Each has its own questions, team, priority triggers and closure proof. A burst pipe also needs a separate "supply restored" update before review when supply had stopped.

**What happens when the ward misses its deadline or two people report the same problem?**
- **Missed deadline:** an automatic escalation to super admins, with one history entry.
- **Same problem twice:** a duplicate suggestion at report time, a staff-confirmed merge, and the second reporter follows the first ticket.

**How is a repair verified, who makes the final decision, and what happens when AI is uncertain?**
Before and after photos are compared side by side, with Claude's assessment. The super admin decides and the database enforces that. If Claude is uncertain or unavailable, it's a manual review, and rework is always possible.

**Which figures came from the synthetic repo, and how can a judge verify them?**
Everything under Money trail (budgets, bills, flags, scorecards, next rupee, complaint trail). Each flag links to its work order, and each work order page lists the CSV fields it uses. Data quality shows the import's commit SHA and row counts.

Key numbers:
- ₹13.43 Cr billed across 2,499 jobs.
- ₹3.03 Cr on fixes that failed within 30 days.
- ₹2.62 Cr paid on roads still under DLP (493 jobs).
- 113 bills above 1.35× the rate card (₹44.8 L above the normal band).
- 45 possible double bills (₹25.9 L).
- Wards E (118%), R/C (114%), L (109%) and M/W (107%) over budget.
- 896 complaints never got a work order.

**What would a real Mumbai ward pilot need, and how would you measure it?**
- **What it needs:** one ward (say K/W) with official boundaries and routing, staff accounts, an SMS/WhatsApp channel, hosted Postgres and storage.
- **Time to first action:** `first_action_at − submitted_at`, with % of reds within 5 h.
- **Verified closure:** % closed by super-admin approval within the deadline (`sla_outcome = met`), and % returned for rework.
- **Repeat issues:** reopen rate within 30 days, and repeat reports within 250 m of a closed ticket.
- **Cadence:** compare month 1 vs month 3 against the 2025 baseline (56% SLA met, 26% reopened in K/W).
