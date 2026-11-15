# Purpose Driven feature-parity record

This is a read-only comparison made on 15 November 2026. It separates what was verified in the live reference applications and locally available source from work that still needs secure storage configuration before it can be called complete.

| Area | Aligned reference (verified) | Focused reference (verified) | Purpose Driven status |
| --- | --- | --- | --- |
| Today and planning | Three-priority daily plan, scheduled actions, check-ins, due dates, sections, completed archive and weekly reset | Capture only | Present; task editing, dates, priorities, people and weekly view retained. More Aligned-specific actions (let go/block and automatic three-pick) remain to restore. |
| Capture and inbox | Text, photos and voice; capture sorting produces actionable items | Typed/voice capture, categories, attachments, draft recovery and Drive-backed entry history | Typed/browser voice, categories and routing to task/person/journal present. Attachments, offline drafts and richer processing remain to restore. |
| Food | Meal slots; reusable foods and recipes; portions; macro totals; water; gym/rest day targets; seven-day history; optional AI/photo estimate | Not a food tracker | Restored portion, date and meal-slot fields plus daily macro totals/history. Reusable-food search, recipes, water, targets and estimates remain to restore. |
| Weight | Weight and waist history, goal and trend chart | Not a weight tracker | Restored dated weigh-ins, optional waist/note/goal and a trend chart. Goal settings/history editing remain to restore. |
| Exercise | Detailed activity: type, date/time, duration, distance, source, heart rate, calories, steps, note, weekly totals and history | Not an exercise tracker | Restored structured activity fields and seven-day totals. Time, screenshots/import and history editing remain to restore. |
| Journal and review | Daily check-ins and weekly reset | Structured category entries stored in Sheets and rendered into monthly/category Docs | Morning priorities, energy and reflection present. Separate readable Docs sync is designed but is not safely operational yet. |
| Drive and multi-device sync | Public Aligned code uses a passcode-protected sync API and local-first merge; its server source was not available | Local Apps Script source is owner-only (`ryan@betheltoulouse.org`) and is not reusable for multi-user personal Drive storage | Google identity verification is deployed separately from storage. User-owned Drive authorization and persistence are blocked until a secure OAuth code-flow backend is configured. |

## Source evidence and boundaries

- The public Aligned site exposed `js/app.js`, `health.js`, `data.js`, and `sync.js`; these were inspected read-only. Its public client keeps `foods`, `meals`, `acts`, `weighins`, `foodDays`, and captures separately, and defines meal slots, health targets and activity fields.
- No Aligned Google Apps Script project/source was available in this workspace or through the public site. It was **not** claimed reviewed.
- The locally available Focused Apps Script source was inspected read-only. It uses an `Entries` spreadsheet, categories, Drive attachments, drafts and a retryable Docs queue, but explicitly limits access to its original owner. That account-specific model is intentionally not copied into Purpose Driven.

## Storage gate

The new fields are validated by the Purpose Driven Apps Script code, but the deployed backend remains deliberately fail-closed until each signed-in user can authorize their own Drive through a secure authorization-code flow. Do not treat a rendered form or a Netlify “Ready” deployment as proof of persisted private data.
