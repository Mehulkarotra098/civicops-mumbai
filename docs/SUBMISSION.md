# Submission answers: CivicOps Mumbai + WardProof

Copy each answer into the matching form field.

**Project name**
CivicOps Mumbai + WardProof

**One-line pitch**
Every complaint has an owner. Every rupee has a reason. And every road carries a QR code that shows its free-repair guarantee.

**Live demo (one-click demo accounts)**
https://civicops-mumbai-demo.vercel.app

**Production URL**
https://civicops-mumbai.vercel.app

**Code repository**
https://github.com/Mehulkarotra098/civicops-mumbai

**Demo video (7 min 58 s, narrated)**
https://github.com/Mehulkarotra098/civicops-mumbai/blob/main/docs/video/civicops-walkthrough.mp4

**Problem**
In Mumbai, a citizen who reports a flooded road, a fallen tree or a burst pipe cannot see who owns the problem, when it is due, or whether it was really fixed. Separately, road-repair money is hard to follow. Bills can be well above the city's own rate card. Repairs can fail within 30 days and be paid for again. Work can be billed while the road is still under the contractor's free-repair guarantee (the defect liability period). Nobody tracks when that guarantee ends.

**What we built**
One app that connects both sides:

1. **Report → fix → proof**
   - A resident reports in a few taps: category questions, GPS or a pin on a real Mumbai map, and a photo.
   - The report is routed to the right ward and department (Juhu → K/W, Andheri East → K/E; a bare "Andheri" asks to confirm).
   - A visible deadline starts: red, first action within 5 h; yellow, resolve by day 7; orange, resolve by day 10. Missed deadlines escalate automatically.
   - The officer and contractor are assigned and alerted, and the work is proven with before and after photos.
   - A person verifies the closure. Claude helps compare the photos, but a person decides.
2. **Where did the money go?**
   - A public, no-login view of each ward's budget → work order → bill → evidence → review.
   - Bills are flagged only when they fall outside normal variation:
     - above 1.3× the rate card
     - possible double bills
     - paid during the defect liability period
     - over budget
   - Anyone can ask a question about an expense. The responsible office must answer by a deadline, escalation is automatic, and an independent reviewer publishes the decision.
3. **Road QR (new)**
   - Every road segment gets a QR code for its site board.
   - Scanning it shows the free-repair guarantee counting down (concrete 10 years, mastic 5, asphalt 3), the contractor responsible and every rupee spent.
   - A "Paid twice?" flag appears when repairs were billed inside the guarantee.
   - One tap reports a problem on that exact road.
4. **Live dashboard**
   - The whole city on a real Mumbai map, with all 24 wards, urgent tickets, deadline health and a live activity feed.
   - Refreshes every 10 seconds; made for a big screen.

**How it maps to the judging criteria**
- **Audit accuracy:**
  - Every flag shows its calculation and source rows.
  - Link Road WO25-01590: ₹23,311 billed vs ₹12,220 rate card, ₹11,091 (90.8%) above, reopened within 30 days.
  - Questioned money is counted once per work order.
- **Fair accountability:**
  - Contractors are compared only with what is normal for their repair method, and speed is also shown excluding heavy-rain days.
  - A flag is "a question, not a finding".
  - The response window, escalation and independent review are built in.
- **Budget smarts:** a next-rupee plan per ward ranks roads by risk and recommends lasting repair methods, with the ₹ allocation.
- **Connects the trail:** complaint (including Hinglish/Marathi words) → issue → work order → bill vs rate card → reopen → expense question → decision, all linked.
- **Usable and demo-ready:**
  - Phone first, in English, Marathi and Hindi (the whole page switches).
  - Live on Vercel with a persistent Postgres database.
  - 57 automated tests and 11 end-to-end browser scenarios, all passing on the live demo.

**How we used Claude**
- Claude built and tested the app with the team.
- In the product, Claude (Opus, through the Anthropic API) compares before and after repair photos and states what it can and cannot verify. A person always makes the final decision, and the review works manually if Claude is unavailable.

**Data used**
- All 17 files of the organisers' dataset (Claude-Impact-Labs-data-2):
  - wards, localities, roads, traffic, facilities, flood hotspots, rainfall
  - complaints, work orders, contractors, rate card
- The data is synthetic and labelled as such everywhere in the app. Live tickets created in the app are stored separately.

**Tech**
Next.js 15, TypeScript, Postgres (Neon) with row-level security, MapLibre GL with OpenFreeMap / OpenStreetMap tiles, Vercel. Each role sees only its own data: resident, ward officer, ward office, auditor and super admin.

**What's next**
- One ward pilot with real completion certificates in machine-readable form.
- QR boards on the first roads, and WhatsApp alerts 90, 30 and 7 days before a guarantee ends.
- Defect notices that cite the contract clause.

**Demo accounts (demo site only, password CivicOps@2026)**
- Resident: asha@civicops.demo
- Ward officer: kw.officer@civicops.demo
- Ward office: kw.admin@civicops.demo
- Auditor: auditor@civicops.demo
- Super admin: admin@civicops.demo
