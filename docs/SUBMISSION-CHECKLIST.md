# C20 submission checklist

Use this checklist with the final working application and the official LMS instructions. This is a preparation aid, not evidence that submissions or human activities have already occurred.

## Confirm the course instructions

- [ ] Confirm team size: the PDF cover says 2-6; the working rules and checklist say 3-5.
- [ ] Confirm the Milestone 1 deadline: the cover and main timeline say 11 October 2026; later milestone text and checklist say 9 October 2026.
- [ ] Check the LMS for the actual submission format, links, schedule, and any updates.
- [ ] Record actual submission receipts. Do not backdate work to imply an earlier submission.

The PDF lists Milestone 2 as **2 November 2026** and Milestone 3 as **1 December 2026**. The project preparation date is 7 November 2026; confirm any arrangements for earlier milestones with the faculty. No extension or approval is assumed.

## Milestone 1 - 8 marks

| Assessment component | Marks | Prepared material | Team action before claiming completion |
|---|---:|---|---|
| Title and prompt use case | 1.0 | `REPORT.md`, title and abstract | Add actual team details |
| Problem and user context | 1.0 | Report Chapters 1-2 | Review for your intended users |
| Reason for selection | 0.5 | Report motivation | Explain the team's actual choice |
| Target users / stakeholders | 0.5 | Report scope | Confirm target group |
| Prompt task definition | 1.0 | Report Chapters 2 and 4 | Demonstrate exact inputs and outputs |
| Technology / model approach | 0.5 | Report Chapter 5 and README | Record actual Node and model versions |
| Existing solutions / gap | 1.0 | Report Chapter 3 | Add any independently investigated comparison |
| Research / evidence | 1.0 | Course brief and cited primary papers | Read references; add genuine user evidence if collected |
| Initial prompt / workflow | 0.5 | Prompt Lab, executable templates, prompt document | Preserve an actual baseline run |
| Faculty / senior / professional feedback | 1.0 | No feedback fabricated | Obtain and document actual discussion and resulting changes |

## Milestone 2 - 12 marks

| Assessment component | Marks | Prepared material | Team action before claiming completion |
|---|---:|---|---|
| Design and diagrams | 2.0 | Report architecture and prompt workflow | Confirm diagram matches the final application |
| Running implementation | 3.0 | Frontend, backend, scheduler, persistence and tests | Run locally and demonstrate end to end |
| Pilot / demonstration | 2.0 | Sample inputs and demo script | Record a real pilot/demo including a failure case |
| Updated repository / source folder | 2.0 | Complete source project | Upload to the required location; verify evaluator access |
| Technical report / abstract | 1.0 | `REPORT.md` | Personalize, verify evidence, format as required |
| Short video, 90-150 seconds | 2.0 | `DEMO-SCRIPTS.md`, short script | Record and submit actual video; a script is not a video |

## Milestone 3 - 10 marks

| Assessment component | Marks | Prepared material | Team action before claiming completion |
|---|---:|---|---|
| Final report | 2.0 | Report draft with all prescribed chapters | Add measured evidence, team details and final references |
| Report organization | 1.0 | Contents, chapters, tables and appendix plan | Export final required format and inspect layout |
| Presentation / creative | 1.0 | Slide outline in `DEMO-SCRIPTS.md` | Create and review final slides/PDF |
| Team viva and contributions | 2.0 | Viva questions and CSV log template | Every member adds genuine evidence and rehearses |
| LinkedIn blog post | 2.0 | Draft communication text | Verify claims; publish from the authorized account if required |
| Final video, 3-5 minutes | 2.0 | Full demo script | Record, upload and submit actual video |

## Software and evidence readiness

- [ ] Follow the root README to start the local application.
- [ ] Confirm subject changes, availability, generation, completion tracking and persistence.
- [ ] Demonstrate an infeasible workload and explain the unallocated hours.
- [ ] Run the automated tests and evaluation runner; preserve the actual output.
- [ ] Run `npm run evaluate`, attach `docs/evaluation-results.json`, and identify the source revision. UI evaluation is stored separately in `data/state.json`.
- [ ] Configure OpenAI only if you intend to run the live prompt workflow.
- [ ] Keep `OPENAI_API_KEY` out of code, screenshots, exports, recordings and shared folders.
- [ ] Record the actual `AI_MODEL` and supported generation settings for live runs.
- [ ] Compare v1/v2/v3 on the same fixed cases and retain unsuccessful attempts.
- [ ] Label local scheduler runs as rule-based; do not use them as LLM results.
- [ ] Inspect both constraint validity and workload coverage.
- [ ] Verify JSON, CSV and calendar exports against the displayed plan.
- [ ] Add screenshots from the actual completed interface.
- [ ] Use synthetic names and availability in publicly shared evidence.
- [ ] Back up the local project data before making demo changes.

## Team and academic integrity

- [ ] Fill the report's team, enrolment, faculty, section and submission fields.
- [ ] Use any declaration/certificate prescribed by the university.
- [ ] Add actual contributions to `CONTRIBUTIONS.csv`; the empty template is not contribution evidence.
- [ ] Link each entry to a file, commit, run record, slide, or dated feedback note.
- [ ] Acknowledge significant AI-assisted development and verify generated material.
- [ ] Confirm every claimed measurement has a traceable source.
- [ ] Remove unsupported claims of improved marks, reduced stress, universal reliability or model superiority.
- [ ] Obtain permission for any identifiable participant information or quotations.
- [ ] Retain final submitted files and upload receipts.

## Suggested final package

Include the source project, README/setup instructions, executable prompts, automated tests, fixed sample inputs, generated evaluation evidence, exported live experiments, final report, slides, contribution log, screenshots, and required video/post links. Exclude `.env`, API keys, unrelated workspace files, dependency caches, and personal data. Check the LMS before choosing a ZIP, repository link, shared folder, or PDF submission.
