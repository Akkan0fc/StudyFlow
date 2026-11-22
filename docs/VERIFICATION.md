# Verification record

Verified on 8 November 2026. All examples use synthetic study data.

## Automated checks

- 91 automated tests passed: 17 scheduling, 16 timetable adapter, 14 HTTP integration, 12 chat interpreter, 10 chat API, 9 provider/feature API, 7 syllabus and 6 timer tests.
- 12/12 deterministic evaluation scenarios passed. Full inputs, outputs, timestamps and checks are in `evaluation-results.json`.
- Frontend JavaScript syntax passed `node --check public/app.js`.

The tests cover input validation, feasible and partial timetables, deadlines, daily caps, free-time windows, cross-midnight breaks, provider errors, bounded repair, persistence after restart, exports, experiment deletion, request validation and localhost access controls.

Chat tests additionally cover atomic request interpretation, ambiguous and unsupported commands, simulated OpenAI action output, conversation history, proposal application and dismissal, exact-match completion preservation, persistence, stale proposals, undo and clear behavior. Local commands are deterministic parsing, not LLM evaluation.

## Browser checks

The actual application was checked at desktop (1440 x 1000) and phone (390 x 844) sizes, as well as the default in-app preview size.

| Action | Observed outcome |
|---|---|
| Generate sample plan | 26 hours allocated across 34 sessions; 11/11 checks passed |
| Mark a session complete, then reload | Completion persisted |
| Edit a subject's topics | Change saved; outdated timetable cleared |
| Change planning start/end dates | New dates saved and used by generation |
| Run an experiment | Input, output and check results recorded in Prompt Lab |
| Run evaluation from UI | All 12 cases passed and details displayed |
| Export CSV | Browser downloaded a readable CSV with actual timetable rows |
| Open mobile navigation | Menu opened with working links and a close control |
| Inspect responsive layout | Dashboard reflowed and timetable remained horizontally scrollable |
| Send “Limit study to 3 hours a day” in side chat | Proposed daily-limit change appeared before any timetable update |
| Apply the chat proposal | Timetable regenerated to 36 sessions with 100% workload coverage |
| Request 45-minute sessions and 15-minute breaks, then dismiss | Preview showed both changes; dismissal preserved the applied plan |
| Undo the preceding chat update | Original 34-session timetable and prior settings were restored |
| Reload and reopen chat | Conversation persisted, including application, dismissal and undo messages |
| Inspect chat at 1440 x 1000 and 390 x 844 | Side drawer on desktop, full-height panel on phone, scrollable messages and reachable composer |

Browser testing revealed and resolved a cross-site navigation restriction that initially blocked the homepage. It also led to larger small text, an accessible mobile menu, better keyboard focus handling and labelled export controls.

## Added feature checks

- Text-based PDF and DOCX extraction executed in automated tests, including invalid files and OCR-needed empty PDFs. Native PDF reader instability was resolved by isolating document parsing in a separate process.
- In an isolated browser preview, a sample syllabus produced four editable topics. Saving into Data Structures and generating yielded sessions for Arrays and linked lists, Stacks and queues, Trees and graph traversal, and Sorting and searching; 11/11 constraints passed.
- A one-minute browser focus round survived navigation/reload and finished with one recorded round and a paused short-break phase. Timer timing, pause/resume, long breaks and restoration have automated checks.
- A timetable session opened the focus timer with the correct topic; explicitly marking it complete updated the saved session. The planning preset prepared 25-minute sessions and 5-minute breaks without silently saving them.
- Light/dark switching and persistence were checked; mobile focus timer and chatbot were visually inspected at 390 x 844 with no horizontal page overflow.
- Custom local endpoint configuration saved in the UI; connection failure showed a clear error. Automated controlled-provider tests exercised both timetable and chat flows, private key persistence and secret-free exports. No real provider call succeeded or was claimed.
- Existing user data was kept separate from browser feature tests.

## What has not been verified

No live OpenAI calls were made because this environment has no configured API key or model. Mocked adapter tests verify request construction, response parsing and error/repair behavior; they do not establish real model quality, latency, account access or cost.

No student learning study, stakeholder interviews, faculty approval, individual team contributions or academic submission has been performed. Those should not be inferred from the automated results.

`sample-plan.json` and `sample-plan.csv` are actual synthetic demonstration outputs from the constraint engine, not language-model outputs.
