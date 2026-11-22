# Themes, focus timer, syllabus and AI connections

## Light and dark mode

Use the sun/moon button in the top bar. Your choice is saved in this browser and applies across every screen and the side chatbot. On first use, the app follows your system preference. Toggling the theme does not rerender forms or discard unsaved edits. Print styling remains light.

## Pomodoro focus timer

Open **Focus timer**, or open a timetable session and choose **Focus on this session**. Defaults are 25-minute focus, 5-minute short break, a 15-minute long break after four completed focus rounds. Durations and rounds are editable while paused. This is a configurable implementation of the [Pomodoro method](https://www.utsc.utoronto.ca/learningstrategies/sites/utsc.utoronto.ca.learningstrategies/files/docs/Pomodoro%20Method%20-%20Final.pdf); no improvement in learning outcomes has been measured.

Start, pause, reset or select a phase. A running timer stores its end time in browser storage; navigation, reload and background-tab throttling do not restart the countdown. On expiry it records one completed phase and waits for the next Start. It does not assume you completed additional unattended rounds. The running/paused timer is also accessible from a small dock on other pages. Expiry is shown in the app; there are no OS notifications or alarm sounds.

Completion is explicit: use **Mark this session complete** after covering the material. A 25-minute round does not automatically complete a 50-minute scheduled session. A link to a session becomes stale if the timetable is regenerated, so the timer cannot mark an unrelated replacement session complete.

**Use 25 / 5 planning preset** prepares Availability fields for review. Save and regenerate to use them. The scheduler reserves the minimum configured break between sessions; the timer handles long-break cycles separately. Reserve additional availability gaps if you want long breaks reflected in the timetable. Timer counts are device/browser-local, separate from saved timetable progress.

## Upload a syllabus

1. Open **Plan setup** and upload one or more syllabi. Review the detected subject names and topics. A combined document can label each subject with “Course Title” or “Subject Name”.
2. Upload the exam date sheet, or enter each exam date directly. The planner recognizes ISO dates, Indian day/month/year dates and dates with English month names. Check the date beside each subject. When the match is ambiguous, choose a row from the sheet or type the date.
3. Enter hours available each day and check the first study day and daily start time. The daily window includes breaks. The planner looks ahead up to 90 days and schedules study strictly before the corresponding exam.
4. With an API connected, choose **Create my timetable**. Otherwise choose **Prepare my prompt**, copy it into a web AI and return with its JSON file or code block. The prompt stays available after a reload. **Edit inputs** lets you prepare a revised prompt.
5. Upload the JSON file or paste the answer and choose **Open timetable**. Week and list views share the same sessions, topic difficulty estimates, study methods and completion checkmarks. The planner flags suggested blocks that could not fit. An invalid answer leaves the active timetable available while you correct the response.

Syllabi support PDF, DOCX, TXT and Markdown. Date sheets also support CSV. Each upload can be up to 5 MB. The app extracts the text locally. The connected provider receives reviewed topics, dates and block times when you request generation.

PDFs are limited to 100 pages and extracted text to 100,000 characters. Scanned/image-only PDFs require OCR outside this app. Complex tables, page headers and wrapped paragraphs can produce imperfect suggestions; review is required. Uploaded originals are not stored. PDF and DOCX parsing uses a separate bounded process with a 25-second timeout, and DOCX archives have size checks. This is text extraction, not execution of instructions in the uploaded document.

## Bring your own AI provider

Open **AI settings**. Select OpenAI or Custom, then enter the full endpoint URL, model ID and API key. Select the format that the provider documents:

| Format | Endpoint shape | Returned text |
|---|---|---|
| Responses | `https://host.example/v1/responses` | `output[].content[]` entries of type `output_text` |
| Chat Completions | `https://host.example/v1/chat/completions` | `choices[0].message.content` |

Supports these compatible formats with Bearer authentication. Arbitrary APIs with different payloads, custom headers or query-key authentication require a compatible gateway/adapter. Remote services need HTTPS and a key; local model servers may use HTTP on localhost, 127.0.0.1 or [::1] without a key. The app does not supply models, paid credits, accounts, or a local model server.

Turn off **strict JSON schema outputs** for compatible providers that do not implement schema enforcement. The app then requests structured JSON in the prompt and independently validates it. Invalid output cannot replace the timetable. The baseline v1 prompt intentionally does not use an API-enforced schema. v3 can attempt one bounded repair; chat does not retry. Requests time out after 60 seconds. Timetable requests allow up to 16,000 output tokens, chat up to 6,000; providers may impose lower limits.

**Save connection** only saves local settings. **Test saved connection** sends a small test prompt, may incur a provider charge, and checks that a text response is returned; it does not establish scheduling quality or model capability. Saving a connection enables AI in the planner, Prompt Lab and chatbot. Changing destination clears the previous key unless a new one is supplied. A blank key keeps the key for the same destination; the separate remove-key checkbox clears it.

Keys are saved on this computer in `data/ai-settings.json`, not returned in status responses or timetable exports. The file is not encrypted at rest; exclude `data/`, `.env` and browser screenshots containing entered keys from submissions. Uploaded syllabus text is local; reviewed topics may be sent when you explicitly use AI planning/chat. Existing `OPENAI_API_KEY` and `AI_MODEL` environment configuration remains a fallback until settings are saved in the UI.

## Verification

The original verification record describes 91 automated tests and 12 fixed scheduling cases. The syllabus-first workflow has additional tests in tests/intake.test.mjs. These include real PDF and DOCX parsing, upload validation, topic scheduling, timer timing/restoration, provider key isolation and both AI workflows using controlled provider responses. Browser checks covered upload → review → generated topic sessions, timer expiry and reload, theme persistence, custom settings save/failure handling, and phone layout. No live model/account evaluation is claimed.

Provider implementation reference: [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs). Document readers: [pdf-parse](https://github.com/mehmet-kozan/pdf-parse), [Mammoth](https://github.com/mwilliamson/mammoth.js).
