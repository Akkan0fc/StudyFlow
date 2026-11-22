# Demonstration and presentation material

Use the actual interface and actual result files. Replace bracketed details only with verified information. These scripts are drafts, not evidence that a video, presentation, or public post has been completed.

## Milestone 2 short video: approximately 120 seconds

| Time | Show | Suggested narration |
|---|---|---|
| 0:00-0:12 | Project title and main planner | “Our project is Smart Study Planner, a constraint-based timetable generator for C20. It turns subjects, exam dates, and free hours into an inspectable study plan.” |
| 0:12-0:35 | Subjects and availability controls | “Here I enter the required preparation hours, deadlines, and available study windows. I can also set a daily limit, session length, breaks, and blocked dates.” |
| 0:35-0:58 | Generate and inspect a timetable | “The backend allocates sessions within those constraints. Each session names the subject and time. These checks verify availability, deadlines, overlaps, daily limits, and breaks.” |
| 0:58-1:15 | A deliberately insufficient workload case | “If the workload does not fit, the application reports the unscheduled hours. A valid partial plan is not presented as a complete plan.” |
| 1:15-1:42 | Prompt Lab and prompt versions | “The Prompt Lab contains a baseline, a structured prompt, and a refined workflow. The same input can be used for comparison. Local rule-based runs demonstrate the scheduler; only a configured live OpenAI run measures language-model output.” |
| 1:42-1:55 | Actual experiment record or test output | “This is the recorded output and its checks. [Describe only a result visible on screen.] Failed attempts remain useful evidence for refinement.” |
| 1:55-2:00 | Source and next steps | “The source, prompts, tests, and report are included. Our next evidence step is [state the actual remaining work].” |

If no real model experiment exists, show the prompt text and say that live comparison is pending. Do not substitute a made-up successful response or imply that a local run called a model.

## Milestone 3 final video: approximately 4 minutes 20 seconds

| Time | Show | Suggested narration |
|---|---|---|
| 0:00-0:25 | Title, problem, team | “Students need a plan that fits real free time and exam deadlines. Our C20 project combines a working planner with a prompt-engineering evaluation workflow. [Introduce actual team members and their roles.]” |
| 0:25-0:55 | Enter a representative synthetic example | “We supply the subject workloads, exam dates, topics, and availability. The student controls these estimates. The application does not claim to predict exam performance.” |
| 0:55-1:25 | Timetable and details | “After generation, we inspect the day-wise plan. These sessions stay within the allowed windows and before the applicable exams. We can mark completed work and inspect remaining hours.” |
| 1:25-1:50 | Constraint checks and insufficient-capacity case | “Constraint validity and completeness are separate. Increasing the workload can leave hours unallocated. The system shows that shortfall instead of inventing extra free time.” |
| 1:50-2:25 | Prompt versions | “Version one is a minimal JSON baseline. Version two adds explicit constraints and a schema. Version three adds boundary examples and can make one repair attempt after an invalid or malformed candidate. These are hypotheses about reliability, tested through recorded runs.” |
| 2:25-3:00 | Actual experiment comparison | “We used [actual model ID], [actual case count], and [actual repeats]. For this case, [describe actual checks, coverage, and failures]. [If not run: ‘Live model evaluation has not yet been completed; these visible results are from the deterministic scheduler.’]” |
| 3:00-3:25 | Architecture and software tests | “The browser sends requests to a local Node backend. The scheduler and evaluator operate on structured data, while local persistence stores the plan and experiments. Our automated evidence covers [actual tested cases from the final run].” |
| 3:25-3:45 | Exports and persistence | “The plan can be exported for use outside the application. Reloading the app preserves saved progress. We review imported calendar times before relying on them.” |
| 3:45-4:10 | Limitations and responsible use | “This is a heuristic scheduler, not an optimality proof. Workload estimates are subjective, and live model output can fail. API keys stay on the server. We use synthetic examples and acknowledge AI-assisted development.” |
| 4:10-4:20 | Closing evidence and links | “The submission includes source, prompts, tests, report, and actual experiment records. Future work includes broader evaluation and stronger optimization.” |

Time this script aloud and adjust to 3-5 minutes. Every member should participate in the required final presentation/viva. Include on-screen captions for important values and use a readable recording resolution.

## Suggested ten-slide presentation

1. **Title and team:** C20, title, actual names, enrolment numbers and roles.
2. **Problem and target user:** inputs, desired plan, why capacity and deadlines matter.
3. **Requirements:** hard constraints versus soft preferences; validity versus completeness.
4. **Architecture:** use the report's diagram; distinguish local algorithm from live model.
5. **Prompt evolution:** v1, v2 and v3 changes; show a short exact excerpt from each.
6. **Working application:** actual screenshots or a live demonstration.
7. **Evaluation design:** fixed cases, metrics, model configuration, sample size.
8. **Results and error analysis:** actual evidence; include one failure and its treatment.
9. **Responsible AI and limitations:** privacy, keys, human review, heuristic limits, disclosure.
10. **Contributions and future work:** evidence links, actual member activities, remaining work.

Keep results blank or explicitly pending until measured. A slide deck outline does not satisfy a request for a final PPT/PDF; create and inspect the final presentation before submission.

## Draft LinkedIn project post

Personalize this text and verify the demonstrated features and results before publishing. Add links only after checking their accessibility.

> For our Prompt Engineering mini-project, we developed **Smart Study Planner - A Constraint-Based AI Timetable Generator (C20)**.
>
> The problem is practical: a study timetable can look organized while still exceeding free time or placing preparation after an exam. Our application accepts subjects, exam dates, estimated preparation hours, and availability, then displays a plan with explicit constraint checks and any unallocated workload.
>
> The project also includes a Prompt Lab with baseline, structured, and refined prompt versions. We separate deterministic scheduler results from live language-model experiments and inspect both constraint validity and workload coverage. This prevents a neat-looking table from being mistaken for verified output.
>
> Our main learning was to treat prompting as an engineering workflow: define the task, preserve the context, specify the output, test against clear criteria, and retain failures as evidence. [Add one measured result only if it is supported by an exported run record, including the model and sample size. Otherwise omit this sentence.]
>
> The prototype has limits: preparation estimates are subjective, the scheduling heuristic does not prove optimality, and live model responses still need validation. We used AI assistance during development and reviewed the resulting work as a team.
>
> [Add actual team acknowledgements and the verified project/demo link.]
>
> #PromptEngineering #StudentProject #StudyPlanner #ResponsibleAI

The guidelines ask for public-facing communication, but no post has been published by this project generation process. Obtain any necessary team agreement and publish from the appropriate account.

## Viva preparation

| Question | Points the team should explain in its own words |
|---|---|
| Why is this a prompt-engineering project? | Versioned prompts, context, schema, actual model experiments, independent evaluation; distinguish these from the scheduler alone. |
| What is a hard constraint? | A rule that must hold, such as no overlap or no study on/after an exam. |
| What is a soft preference? | A preference used within feasible choices, such as morning study or subject priority. |
| Can a valid plan still be incomplete? | Yes. It may contain only some requested hours; coverage and shortfalls must be reported. |
| Why validate JSON output separately? | JSON structure cannot establish the correctness of dates, overlaps or workload allocation. |
| What changes between prompt versions? | Show exact template differences and explain the hypothesis without claiming unmeasured benefits. |
| What is the role of repair in v3? | One bounded retry based on failed checks or parsing errors; initial and final outcomes remain distinct evidence. Network/provider transport failures do not trigger model repair. |
| Is the rule-based mode an AI model experiment? | No. It runs the deterministic scheduler and is labelled accordingly. |
| How did you compare versions fairly? | Same cases and model/settings, all attempts retained, both validity and coverage reported. |
| How do you know the timetable is optimal? | The current heuristic does not establish optimality. Explain the observed allocation and limitation. |
| What happens without an API key? | Local scheduling continues; live model experiments require server-side configuration. |
| What data leaves the computer? | The provided planning context during a live API call; local scheduling needs no model call. |
| How did each member contribute? | Refer to genuine entries and evidence in the contribution log. |
| What did AI assistance contribute? | State the actual development assistance and the team's review/testing responsibility. |
| What failed during evaluation? | Show a real failed case; explain the observed issue and any measured retest. |
| What would you improve next? | Choose a bounded extension and explain how its benefit would be evaluated. |

## Contribution and feedback recording

For `CONTRIBUTIONS.csv`, add one row per actual activity. Use a date, real member identity, clear action, and an evidence path or URL. Do not distribute fabricated equal contributions. Valid examples of activity types include writing a fixed test case, reviewing a prompt revision, correcting a UI issue, verifying export behaviour, conducting a consented user review, or preparing a specific slide.

For faculty or user feedback, record the date, participant role, permission to quote if needed, the actual comment, the resulting change, and its evidence. Do not invent positive feedback to fill an assessment row.
