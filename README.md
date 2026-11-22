# Smart Study Planner - C20

**A Constraint-Based AI Timetable Generator** for the Bennett University Prompt Engineering mini-project. The interface is named **StudyFlow**.

The project runs locally with an interactive planner, a real Node backend, persistent storage, a constraint scheduler, and an optional AI Prompt Lab with configurable providers. The local scheduler works without an API key. Live AI responses are checked before being accepted as a timetable.

## Start the application

Requires **Node.js 22.3 or newer**. Run `npm ci` once to install the PDF/Word document readers and test dependencies. The Windows launcher does this automatically if dependencies are missing. First setup needs internet; local scheduling and syllabus extraction then work offline.

**Windows:** double-click `START-STUDY-PLANNER.cmd`, keep its window open, then open [the planner](http://127.0.0.1:4310).

**Terminal:** open this project folder and run:

```sh
npm ci
npm start
```

Visit **http://127.0.0.1:4310**. Stop the server with `Ctrl+C` in its terminal. `npm run dev` starts Node's watch mode for development. If port 4310 is already in use, stop the previous instance or set `PORT` in `.env` and use the printed address.

## What the project does

- Captures subjects, topics, exam dates, required preparation hours, priority and difficulty.
- Switches between light and dark themes and remembers your choice.
- Includes a persistent Pomodoro focus timer, session linking, and a 25 / 5 planning preset.
- Imports PDF, DOCX, TXT and Markdown syllabi into editable topics and generates a plan from them.
- Connects OpenAI or compatible custom APIs through a dedicated settings screen.
- Uses weekday availability windows, blocked dates, session length, breaks, daily caps and time preferences.
- Generates a timetable with subject-level allocation and remaining-work totals.
- Checks time bounds, deadlines, availability, overlaps, breaks, session length and workload limits.
- Tracks completed sessions and preserves state across restarts.
- Exports JSON, CSV and `.ics` calendar files.
- Includes three prompt versions, recorded experiments, independent validation and a bounded repair workflow.
- Includes a side chat for previewing planner changes, applying them, dismissing them, and undoing the latest eligible update.
- Runs a reproducible evaluation set and includes academic report/demo materials.

This is a heuristic scheduler. It does not prove an optimal allocation, predict marks, or establish an effective spaced-repetition programme. A complete, constraint-valid plan and a useful learning plan are different claims.

## Suggested demonstration

1. Upload your own syllabus in **Plan setup** and enter or import the exam dates.
2. Save your settings and generate with the **constraint engine**.
3. Inspect sessions, checks, subject coverage and any remaining hours.
4. Mark a session complete, reload, and confirm saved progress.
5. Increase the required workload or reduce availability to demonstrate an honest partial plan.
6. Open Prompt Lab and compare the prompt text. An engine run is a rule-based control, regardless of which prompt version is selected.
7. Run the built-in evaluation and export a plan or experiment evidence.
8. If OpenAI is configured, run matched inputs through v1/v2/v3 and inspect actual outputs and failures.

Saving changed planner settings clears the existing timetable; generating again replaces it and starts new completion tracking. Experiments are retained separately. Export evidence before changing a demonstration you want to preserve.

## Plan assistant

Open **Plan assistant** to adjust saved settings through chat. Local commands work without an API key; try `Limit study to 3 hours a day`, `Use 45 minute sessions and 15 minute breaks`, `Keep Sundays free`, or `What can you change?`. Send one command at a time. Configured AI mode supports broader wording after the optional setup below.

Chat changes remain a preview until you choose **Apply & update timetable**. Applying regenerates with the constraint engine and preserves completion only for sessions with the same subject, date, times, topic and type. **Dismiss** leaves the timetable unchanged. **Undo update** restores the latest chat update only if the saved planner and progress have not changed since. Unsaved availability edits block applying or undoing until you save or reset them.

The latest **60 messages** persist in `data/state.json`. Clearing conversation removes messages and the pending proposal, not the timetable. See [the chat guide](docs/CHAT-GUIDE.md) for supported commands, safeguards and API details.

## Themes, Pomodoro and syllabus uploads

Use the theme button in the top bar. Open **Focus timer** for configurable 25 / 5 focus rounds, short/long breaks, pause/reset and saved countdowns. A timetable session can be linked to the timer; completion stays explicit. The **25 / 5 planning preset** prepares Availability fields for review and saving. Long breaks remain timer phases; reserve extra schedule gaps if needed.

**Plan setup** opens with an empty workspace on first use. Upload the syllabus and optionally a date sheet, review the subjects and dates, then enter the hours you have per day. With a configured provider, **Create my timetable** estimates difficulty and assigns topics to timed blocks. Without a provider, **Prepare my prompt** gives you the same inputs to paste into a web AI. Upload its JSON file or paste its answer to open the interactive timetable and track sessions. Text-based documents are read locally. Scanned PDFs need OCR first.

See [the feature guide](docs/FEATURES-GUIDE.md) for full workflows, formats and limitations. A synthetic [sample syllabus](docs/sample-syllabus.txt) is included.

## Optional AI connection

1. Open **AI settings** and choose OpenAI or Custom / compatible API.
2. Select Responses or Chat Completions format, and enter the complete endpoint URL, model ID and API key. A compatible local model server can omit the key.
3. Enable strict JSON schema only if supported by your provider, then **Save connection**.
4. Use **Test saved connection** to send a small test prompt, or choose AI in generation, Prompt Lab or chat.

Saving does not contact the provider; testing and AI use may incur API charges. Remote endpoints require HTTPS and Bearer authentication. Other API formats or authentication mechanisms require a compatible adapter. A URL alone cannot make an arbitrary service compatible.

The key is submitted through the local settings form and saved privately in `data/ai-settings.json`. It is never returned by status endpoints or included in timetable exports; the local file is not encrypted at rest. Keep `data/` and `.env` out of shared archives. Changing destination clears the old key unless you supply a new one. Blank keys preserve the same destination's saved key; use the remove-key checkbox to clear it.

Legacy `.env` configuration still works for OpenAI until UI settings are saved:

```dotenv
PORT=4310
AI_MODEL=your-supported-model-id
OPENAI_API_KEY=your-api-key
```

Both adapters use the configured endpoint. Timetable generation allows **16,000 output tokens**; chat allows **6,000**. Responses requests send `store: false`; the OpenAI Chat Completions preset also sends it. Custom Chat Completions uses `max_tokens` for compatibility and does not assert provider retention behavior. No temperature is sent. v1 is the baseline; v2/v3 request strict schema when enabled or include a schema in the prompt otherwise. v3 can make one repair request after invalid output; transport/authentication failures are not retried. Each request has a 60-second timeout.

Every candidate is independently checked. An invalid timetable is retained as experiment evidence and cannot replace your plan. Partial plans remain visible. See the [official structured-output guide](https://developers.openai.com/api/docs/guides/structured-outputs) for the OpenAI format. No live provider/account evaluations were performed; supplied AI tests use controlled responses.

## Tests and evaluation

The original verification record reported **91 automated tests**: 17 scheduler, 16 timetable AI adapter, 14 general HTTP API, 12 chat unit, 10 chat HTTP API, 9 provider/feature API, 7 syllabus, and 6 timer tests. **12/12 deterministic evaluation cases** also passed. See [the verification record](docs/VERIFICATION.md) for browser observations and the actual synthetic [sample plan](docs/sample-plan.json). OpenAI tests use simulated responses; neither live timetable generation nor live AI chat has been tested with an API account.

```sh
npm test
npm run evaluate
```

`npm test` runs the automated regression suite. `npm run evaluate` runs 12 fixed synthetic scheduler cases and writes **`docs/evaluation-results.json`** with its timestamp, inputs, sessions, checks and expected outcomes. The command exits unsuccessfully if a case fails. Read the generated artifact for the actual results; the README does not supply invented benchmark scores.

The UI evaluation action uses the same case runner and saves its result under `evaluation` in **`data/state.json`**. It does not rewrite `docs/evaluation-results.json`; use `npm run evaluate` to refresh that downloadable report.

Evaluation cases cover a feasible workload, insufficient capacity, no free hours, a blocked date, an exam on the starting date, a daily cap, a short window, adjacent windows requiring a break, an invalid leap-day date, duplicate subject IDs, overlapping availability, and instruction-like text treated as a label. A valid case passes when every hard check passes **and** its allocated minutes match the case's expected value. An invalid-input case passes when validation rejects it with the expected input-error status. These are scheduler checks, not model-quality or user-study results.

### How experiment metrics are calculated

| Field | Actual implementation |
|---|---|
| Constraint pass rate | Percentage of passed hard-check categories, rounded to a whole percent; excludes the separate `coverage` check. No available checks gives 0. |
| Coverage | Requested minutes allocated, expressed as a percentage to one decimal place; subject shortfalls are reported separately. |
| Latency | Measured elapsed generation time in milliseconds. In v3 it includes any repair request. |
| Session count | Number of accepted output sessions. Rejected AI outputs produce no accepted sessions. |
| Attempts | Actual model attempt text, rendered prompt, checks, error and usage metadata when returned by OpenAI. |

The evaluator has ten hard scheduling categories plus a coverage check. AI evaluation adds a topic-grounding check. Therefore, engine and AI pass-rate denominators can differ. For rejected AI output, the stored checks refer to the last candidate while accepted-session metrics are zero; inspect the error and attempt records, not just a score. A 100% hard-check score can accompany an empty or incomplete plan. Always report coverage alongside validity.

The stored history retains the **latest 100 experiments**. Export older evidence before creating more runs. An experiment records the exact inputs, rendered prompt, execution mode, provider/model, raw output, attempts, checks and metrics. All three prompt versions use the identical algorithm in engine mode; engine runs cannot establish prompt improvement.

## Local API

All routes use the local server. Write requests except `DELETE` require `Content-Type: application/json`. Payloads are limited to 128 KB, except syllabus extraction (8 MB JSON envelope for a 5 MB file). The server accepts local hostnames only and blocks cross-origin changes. There is no account system; do not expose this service to a network or public tunnel as a multi-user application.

| Method and path | Purpose / body |
|---|---|
| `GET /api/health` | Server status and whether the saved AI provider is configured; no key returned |
| `GET /api/state` | Saved config, current plan, experiment history, UI evaluation and chat state |
| `GET /api/provider` | Masked provider configuration, no raw key |
| `PUT /api/provider` | Save provider, protocol, endpoint, model, key and schema preference |
| `POST /api/provider/test` | Test saved connection with a small prompt |
| `POST /api/intake/prepare` | Prepare and save a draft and its web-AI prompt |
| `POST /api/intake/generate` | Generate a timetable with the saved provider and current draft ID |
| `POST /api/intake/import` | Validate a returned JSON answer against the current draft and open the timetable |
| `POST /api/syllabus/extract` | `{ "filename": "course.pdf", "base64": "…" }`; extract topics for review |
| `GET /api/prompts` | Prompt versions and response schema |
| `PUT /api/config` | Save the full validated planner configuration; clears the current plan |
| `POST /api/generate` | `{ "mode": "engine", "promptVersion": "v3" }`; save a new plan and experiment |
| `POST /api/experiments` | Same body; record a run without replacing the current plan |
| `PATCH /api/sessions/:id` | `{ "completed": true }` or `false` |
| `POST /api/evaluate` | `{}`; run fixed scheduler cases and save UI results |
| `DELETE /api/experiments/:id` | Delete one saved experiment |
| `GET /api/export?format=json` | Download complete current state; requires a generated plan |
| `GET /api/export?format=csv` | Download current timetable rows |
| `GET /api/export?format=ics` | Download current timetable calendar events |
| `POST /api/chat` | `{ "message": "Limit study to 3 hours a day", "mode": "local" }`; reply and optional change preview |
| `POST /api/chat/apply` | `{ "proposalId": "..." }`; apply a current proposal and regenerate the timetable |
| `POST /api/chat/dismiss` | `{ "proposalId": "..." }`; dismiss a pending proposal |
| `POST /api/chat/undo` | `{}`; restore the latest eligible chat update |
| `POST /api/chat/clear` | `{}`; clear conversation and pending proposal without changing the plan |

For generation/experiments, `mode` is `engine` or `ai`; `promptVersion` is `v1`, `v2` or `v3`. Invalid AI generation returns an error and preserves the experiment. Input-validation failures are reported as actionable errors.

The full configuration shape is:

```json
{
  "startDate": "2026-11-09",
  "endDate": "2026-11-15",
  "sessionMinutes": 50,
  "breakMinutes": 10,
  "maxDailyHours": 4,
  "preferredTime": "balanced",
  "subjects": [{
    "id": "math", "name": "Mathematics", "examDate": "2026-11-16",
    "hours": 2, "priority": 3, "difficulty": 2, "topics": ["Matrices"]
  }],
  "availability": [{ "day": 1, "start": "18:00", "end": "21:00" }],
  "blockedDates": []
}
```

Weekday 0 means Sunday and 6 means Saturday. Planning dates are inclusive; study must be on a date strictly before the subject's exam. Limits include 1-90 days, 1-20 subjects, up to 70 weekly availability windows and 50 topics per subject. Session length is 15-180 minutes, break length 0-60 minutes and the daily cap 0-16 hours. Fractional hour inputs must represent whole minutes. A window may end at `24:00`; split an overnight window between two weekdays. Calendar exports use floating local times, so review the receiving calendar's timezone interpretation.

## Storage, source and project materials

`data/state.json` holds the configuration, plan, progress, latest 100 experiments, UI evaluation and chat state (latest 60 messages, pending proposal and one undo snapshot). It is created on first start. Writes use a temporary file and replacement; an unreadable saved file is not silently overwritten. Stop the server before manually copying or restoring this file. This is single-user JSON storage without cloud sync, accounts or multi-process coordination.

| Path | Purpose |
|---|---|
| `public/` | Browser interface |
| `server/index.mjs` | HTTP API and static files |
| `server/scheduler.mjs` | Input validation, scheduling and independent constraint checks |
| `server/prompts.mjs` | Versioned prompts and output schema |
| `server/ai.mjs` | OpenAI adapter, parsing, validation and bounded repair |
| `server/chat.mjs` | Local command interpreter, OpenAI chat prompt/action schema and validated configuration proposals |
| `server/provider.mjs` | Responses/Chat Completions transport and private provider settings |
| `server/syllabus.mjs` | Local document validation and bounded text extraction |
| `public/features.js` | Focus timer and AI settings UI |
| `public/planner-setup.js` and `server/intake.mjs` | Syllabus setup, dates, prompt handoff and timetable validation |
| `public/theme.js` | Saved light/dark preference |
| `docs/FEATURES-GUIDE.md` | New feature workflows and verification |
| `server/store.mjs` | Local persistence |
| `server/exports.mjs` | CSV and calendar exports |
| `server/evaluate.mjs` | Fixed synthetic evaluation cases |
| `tests/` | Automated regression tests |
| `docs/REPORT.md` | Technical report draft with prescribed chapters |
| `docs/PROMPT-ITERATIONS.md` | Prompt design and fair comparison protocol |
| `docs/SUBMISSION-CHECKLIST.md` | Milestone mapping and final checks |
| `docs/DEMO-SCRIPTS.md` | Short/final video scripts, slide outline, LinkedIn draft and viva guide |
| `docs/CONTRIBUTIONS.csv` | Blank template for actual member evidence |
| `docs/CHAT-GUIDE.md` | Side-chat workflow, supported commands, persistence and API |

The academic materials are editable Markdown drafts. They are **not** a finished Word/PDF report, PPT deck, recorded video or published social post. Complete team names/enrolment numbers, the prescribed declaration, actual contributions, faculty/user feedback, live LLM comparisons and any required final presentation/media. Preserve failures and acknowledge AI-assisted development. Do not describe the supplied drafts as already submitted or published.

The guidelines conflict on team size and the first milestone date; see the submission checklist and confirm the official LMS instructions. The project remains local-only and has not been published online.
