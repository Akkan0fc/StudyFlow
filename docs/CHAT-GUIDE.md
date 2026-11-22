# StudyFlow planning assistant

The side chat explains your saved settings and prepares changes to them. A supported change request creates a **preview**; it does not silently edit your timetable. Review the changes and choose **Apply & update timetable** to update the saved settings and regenerate the plan with the local constraint engine.

## How to use it

1. Save any subject or availability edits, then open **Plan assistant**.
2. Choose **Local commands** or **configured AI** mode and send a request. Enter sends; Shift+Enter adds a new line.
3. Read the assistant's reply and the proposed changes.
4. Apply the proposal to regenerate, or dismiss it to leave the plan unchanged.
5. Inspect the timetable, coverage and warnings after applying.

The preview uses saved settings. Unsaved availability edits disable Apply and Undo so a chat change cannot overwrite them accidentally. Save or reset those edits first; finish any open subject edit as well. A proposal becomes stale if the saved configuration, timetable or completion progress changes after it was created. Applying a stale proposal is rejected; ask again using the current state.

Only one preview is pending at a time. Sending another message clears the previous preview, even if the new message is only a question. Applying or dismissing a proposal never relies on an older preview identifier.

## Supported local commands

Send one command at a time. Replace the example subject with an existing subject's name, and use real `YYYY-MM-DD` dates and 24-hour `HH:MM` times.

| Example | Effect |
|---|---|
| `What can you change?` or `help` | Show supported forms; no proposed change |
| `Show my settings` or `status` | Summarize saved inputs; does not claim timetable feasibility |
| `Limit study to 3 hours a day` | Set the daily work cap |
| `Use 45 minute sessions and 15 minute breaks` | Set session and break lengths |
| `Use 20 minute breaks` | Change only the break length |
| `Keep Sundays free` | Remove all Sunday availability windows |
| `I prefer mornings` | Set the soft time preference; evenings and balanced are also supported |
| `Keep 2026-11-15 free` | Add a blocked date |
| `Unblock 2026-11-15` | Remove that blocked date |
| `I'm free Monday from 18:00 to 21:00` | Replace **all** Monday windows with this one window |
| `Plan from 2026-11-09 to 2026-11-22` | Change the inclusive planning range |
| `Set Data Structures to 8 hours` | Change the matched subject's workload |
| `Make Data Structures high priority` | Set priority; low and medium are also supported |
| `Set Data Structures exam to 2026-11-20` | Change that subject's exam date |

Local commands do not add or remove subjects, change topic lists or difficulty, or resolve relative dates such as “tomorrow.” Use the normal subject editor or configured AI mode for broader requests. Ambiguous subject matches ask for the full name. Unsupported or invalid commands produce an explanation without a proposal.

## Modes and limitations

**Local mode** recognizes a defined set of commands without an API key. It is a deterministic command interpreter, not a language model. If wording is unsupported or ambiguous, it asks for a supported form instead of inventing a change.

**AI mode** interprets natural-language requests using the connection saved in AI settings (OpenAI or a compatible custom provider). The existing OpenAI `.env` configuration remains a fallback. The key stays on the backend. The current message, saved configuration and latest 12 conversation messages are sent to the provider, together with the current date in Asia/Kolkata. Use synthetic data in demonstrations. Broader supported actions include adding/removing subjects, changing topics or difficulty and combining clear requested changes; missing details should lead to clarification. The backend rejects unsupported actions and invalid configurations before creating a preview.

The UI enables AI mode after configuring a provider in AI settings. Direct API requests without configuration return an explanatory assistant message and no proposal; they do not silently fall back to local interpretation. Network/provider failures similarly leave settings unchanged. No real OpenAI calls are included in the project's testing evidence.

Chat uses the configured Responses or Chat Completions format, requesting an action schema through the API when enabled or through prompt instructions otherwise, a **6,000 output-token limit**, a 60-second timeout and no automatic retry. The separate timetable AI workflow uses a **16,000 output-token limit** and its own prompt versions. Chat conversation is not a Prompt Lab A/B experiment and does not create a prompt-comparison result.

Applying a chat proposal always uses the constraint engine to regenerate the timetable, even when an AI provider interpreted the request. Completion is preserved only when subject ID, date, start, end, topic and study/revision type all match a completed session in the previous plan. Moved or changed sessions do not automatically inherit completion. The confirmation states how many completed sessions were kept or no longer match. A valid regenerated plan can still have unallocated workload; inspect the shortfall warnings.

## Undo, clearing and persistence

Undo restores the latest chat-applied change only while the current saved configuration and plan still match the result of that change. Subsequent edits, regeneration or completion changes can make undo stale; the backend then refuses to overwrite the newer state.

Clearing chat removes the conversation and pending proposal while leaving the timetable and any eligible undo snapshot unchanged. The latest 60 chat messages, pending proposal and undo snapshot are stored with the planner in `data/state.json` and survive restart. This remains a local, single-user application; chat is not an account-based messaging service.

## API

| Route | Body | Result |
|---|---|---|
| `GET /api/state` | None | Includes `chat` with messages, pending proposal and undo state |
| `POST /api/chat` | `{ "message": "…", "mode": "local" }` or mode `ai` | Reply and optional preview; no timetable mutation |
| `POST /api/chat/apply` | `{ "proposalId": "…" }` | Updated config, regenerated plan and chat |
| `POST /api/chat/dismiss` | `{ "proposalId": "…" }` | Removes the selected pending proposal |
| `POST /api/chat/undo` | `{}` | Restores the latest eligible chat update |
| `POST /api/chat/clear` | `{}` | Clears conversation/proposal without changing the timetable |

Requests use the same local-origin, JSON-body and persistence safeguards as the rest of the application. An error does not authorize a partial update.

The backend and UI accept message text of 1-4,000 characters and `local` or `ai` mode. Stale/missing proposal IDs and stale undo requests return HTTP 409. The implemented chat prompt, action schema, command parser and configuration validator are in `server/chat.mjs`; persistence, Apply/Undo guards and session matching are in `server/index.mjs`.

## Verification

The automated suite contains 91 passing tests, including 12 chat unit tests and 10 chat HTTP integration tests. Chat tests cover command interpretation, invalid/ambiguous requests, controlled OpenAI responses, preview-only behaviour, completion preservation, persistence, dismiss/clear, stale proposals and undo, history limits, and missing API configuration. Controlled provider responses test application behaviour; they do not establish real model quality or account access. See `docs/VERIFICATION.md` for the separate browser verification record.
