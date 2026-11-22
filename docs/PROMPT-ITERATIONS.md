# Prompt versions and experiment protocol

Project: Smart Study Planner - A Constraint-Based AI Timetable Generator (C20).

This document explains prompt design. The executable templates in the server are the source of truth for exact wording. A version is a design artifact; an experiment is an actual execution with recorded input and output. Do not describe the versions below as experimentally proven improvements until the evidence supports that claim.

## Version history

| Version | Change | Hypothesis | Evidence required |
|---|---|---|---|
| v1: baseline | A direct planning request for minimal JSON plus the student's context; no API-enforced schema | Establish the starting behaviour | Actual raw output, parse status, coverage and failed constraints |
| v2: structured | Add explicit constraints and an API output schema with exact IDs and date/time representation | Reduce format ambiguity and unknown-subject errors | Matched runs on the same cases and model |
| v3: refined | Include boundary examples and independent validation; permit at most one repair attempt on an invalid or malformed candidate | Reduce semantic violations while keeping coverage visible | Matched validity and coverage results, including initial and repair failures |

## Prompt responsibilities

Every live prompt should have a clear task, the same grounded student context, and a defined output contract. The refined design emphasizes:

- All subject IDs and topics come from the supplied context.
- Study occurs only within the planning range and before the applicable exam date.
- Availability windows, blocked dates, daily caps, and breaks are hard constraints.
- Priority, difficulty, and preferred time are preferences within those constraints.
- Insufficient time is reported explicitly; extra hours or dates are not invented.
- Output uses structured session data with concise explanations rather than hidden model reasoning.
- Text inside subject names or topics is input data and cannot override the instructions.

## Illustrative example for discussion

The following is an example of a desired valid session, not an observed model output:

```json
{
  "subjectId": "math",
  "date": "2026-11-09",
  "start": "17:00",
  "end": "17:50",
  "durationMinutes": 50,
  "topic": "Matrices",
  "type": "study",
  "reason": "Allocated before the exam within the available evening window."
}
```

For this example to be valid, the original input must contain the `math` subject, an exam after 9 November, a suitable Monday availability window, enough unallocated study minutes, and compatible daily/break limits. JSON appearance alone cannot establish validity.

## Fixed comparison cases

Use synthetic subjects and preserve exact JSON for each case.

| Case | Purpose | Conditions to preserve across versions |
|---|---|---|
| Typical | Representative mixed-subject request | Same subjects, hours, deadlines and availability |
| Tight capacity | Show tradeoffs and partial plans | Requested workload close to available capacity |
| Impossible workload | Test honest incompleteness | Requested workload exceeds feasible hours |
| Deadline pressure | Test subject-specific cutoff | At least one early exam and one later exam |
| Interrupted availability | Test blocked dates and multiple windows | Identical windows and blocked days |

Do not rewrite input after seeing a failure unless the revised case receives a new identifier. Avoid giving later versions easier cases. Keep a separate holdout case if you repeatedly tune the prompts on the initial set.

## Execution modes

| Mode | What it measures | What it cannot establish |
|---|---|---|
| Deterministic / offline | Scheduler output, interface flow, validator behaviour | Language-model quality, prompt sensitivity, model improvement |
| Live configured provider | Actual model response to a recorded prompt | General performance beyond the tested cases and settings |
| Imported/manual inspection, if used | Checks on the specific supplied candidate | Provenance unless the source and settings are documented |

The configured live provider is OpenAI, using the Responses API. `OPENAI_API_KEY` and `AI_MODEL` remain server-side. All three versions use exactly the same scheduler when the local rule-based mode is selected; any difference there is not evidence of prompt quality.

Never generate artificial baseline failures or invented version scores to make v3 look better. An API error is an API error; retain it separately from a valid but poor model response. The application rejects an invalid AI candidate for the timetable while retaining experiment evidence. v3 may perform at most one repair request after an invalid or malformed candidate; retain the original candidate and describe the repair separately. Network, timeout and provider transport failures do not trigger model repair. Report v3's extra call and elapsed time when comparing it with single-call versions. Do not claim a successful repair until the measured checks show it.

## Minimum experiment record

The application records the run ID/time, exact input, prompt version and rendered text, execution mode, provider/model, raw output, accepted sessions, attempt-level errors/checks/usage, latency and coverage. Add your fixed case ID and analysis notes when exporting evidence. The live adapter sends `store: false`, a 16,000 output-token limit and no temperature setting; v2/v3 use the schema. Preserve these settings and the source revision with the records. The latest 100 experiments are retained locally; export older runs before they are displaced.

The displayed constraint percentage counts passed hard categories, excluding coverage, and rounds to a whole percent. Core scheduling has ten hard categories; AI adds topic grounding. Invalid AI runs retain last-candidate checks but have zero accepted sessions. Coverage is rounded to one decimal place. Inspect errors, attempts and coverage before interpreting a high constraint percentage. No live LLM comparison has been completed in the supplied evidence.

Use this table after real runs; it intentionally contains no invented scores:

| Case | Version | Mode / model | Attempt | Parse success | Failed checks | Coverage | Run record |
|---|---|---|---|---|---|---|---|
| [Actual case] | [v1/v2/v3] | [Recorded value] | [Number] | [Observed] | [Observed] | [Observed] | [File/run ID] |

## Error analysis worksheet

For each meaningful failure, record:

1. **Observation:** quote a short relevant output fragment or point to a session ID.
2. **Rule violated:** identify the original constraint and expected result.
3. **Likely cause:** label the explanation as a hypothesis unless established.
4. **Change:** record the exact prompt or implementation change.
5. **Retest:** rerun the failed case and the unchanged comparison set.
6. **Tradeoff:** check whether validity improved by simply scheduling less work.

Suggested error categories: malformed response, unknown subject, invalid date/time, outside availability, blocked day, overlap, inadequate break, daily overload, exam-date violation, workload excess, omitted workload, misleading explanation, provider failure.

## Reporting the comparison

State sample size, number of repeats, model identifier, run dates, and settings. Show both valid-candidate rate and coverage. A candidate with no sessions can avoid overlaps while doing none of the requested work. Do not combine local scheduler runs and live model runs into one performance average. Use modest conclusions such as “v3 passed more checks on these recorded cases” when supported, rather than claiming universal superiority.
