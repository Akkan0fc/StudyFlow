const MINUTE = 60_000;
const DAY = 86_400_000;
const MAX_SESSIONS = 10_000;

function bad(message) {
  const error = new Error(message);
  error.status = 400;
  throw error;
}

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function number(value, label, min, max, integer = false) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    bad(`${label} must be ${integer ? 'an integer' : 'a number'} between ${min} and ${max}.`);
  }
  return value;
}

function dateValue(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value) return null;
  return time;
}

function date(value, label) {
  if (dateValue(value) === null) bad(`${label} must be a real date in YYYY-MM-DD format.`);
  return value;
}

function timeValue(value, allowMidnight = false) {
  if (allowMidnight && value === '24:00') return 1440;
  if (typeof value !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

function time(minutes) {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function hoursInMinutes(value, label, min, max) {
  number(value, label, min, max);
  const minutes = value * 60;
  if (Math.abs(minutes - Math.round(minutes)) > 0.000001) bad(`${label} must represent a whole number of minutes (for example, 1.5 hours).`);
  return Math.round(minutes);
}

function text(value, label, maxLength = 120) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) bad(`${label} must contain 1–${maxLength} characters.`);
  return value.trim();
}

/** Validate and copy every scheduling input. Dates and weekly day numbers use UTC calendar arithmetic. */
export function validateInput(raw, {allowEmpty = false} = {}) {
  if (!object(raw)) bad('Planner input must be an object.');
  const startDate = date(raw.startDate, 'Start date');
  const endDate = date(raw.endDate, 'End date');
  const days = (dateValue(endDate) - dateValue(startDate)) / DAY + 1;
  if (days < 1 || days > 90) bad('The planning period must contain 1–90 days, including its end date.');
  const sessionMinutes = number(raw.sessionMinutes ?? 50, 'Session length', 15, 180, true);
  const breakMinutes = number(raw.breakMinutes ?? 10, 'Break length', 0, 60, true);
  const maxDailyMinutes = hoursInMinutes(raw.maxDailyHours ?? 4, 'Daily study limit', 0, 16);
  const preferredTime = raw.preferredTime ?? 'balanced';
  if (!['balanced', 'morning', 'evening'].includes(preferredTime)) bad('Preferred time must be balanced, morning, or evening.');
  if (!Array.isArray(raw.subjects) || (!allowEmpty && raw.subjects.length < 1) || raw.subjects.length > 20) bad('Add between 1 and 20 subjects.');
  const ids = new Set();
  const subjects = raw.subjects.map((subject, index) => {
    if (!object(subject)) bad(`Subject ${index + 1} must be an object.`);
    const id = text(subject.id, `Subject ${index + 1} ID`, 80);
    if (ids.has(id)) bad('Every subject must have a unique ID.');
    ids.add(id);
    const name = text(subject.name, `Subject ${index + 1} name`);
    const examDate = date(subject.examDate, `${name} exam date`);
    const minutes = hoursInMinutes(subject.hours, `${name} study hours`, 1 / 60, 1000);
    const priority = number(subject.priority ?? 2, `${name} priority`, 1, 3, true);
    const difficulty = number(subject.difficulty ?? 2, `${name} difficulty`, 1, 3, true);
    if (subject.topics !== undefined && (!Array.isArray(subject.topics) || subject.topics.length > 50)) bad(`${name} topics must be an array containing at most 50 topics.`);
    const topics = (subject.topics ?? []).map((topic) => text(topic, `${name} topic`, 200));
    return { id, name, examDate, hours: minutes / 60, priority, difficulty, topics };
  });
  if (!Array.isArray(raw.availability) || raw.availability.length > 70) bad('Availability must be an array containing at most 70 weekly windows.');
  const availability = raw.availability.map((window, index) => {
    if (!object(window)) bad(`Availability window ${index + 1} must be an object.`);
    const day = number(window.day, 'Availability day', 0, 6, true);
    const start = timeValue(window.start);
    const end = timeValue(window.end, true);
    if (start === null || end === null || start >= end) bad(`Availability window ${index + 1} needs valid HH:MM times with start before end; split overnight windows into two days.`);
    return { day, start: time(start), end: time(end) };
  }).sort((a, b) => a.day - b.day || a.start.localeCompare(b.start));
  for (let index = 1; index < availability.length; index++) {
    const current = availability[index];
    const previous = availability[index - 1];
    if (current.day === previous.day && current.start < previous.end) bad('Availability windows on the same weekday must not overlap.');
  }
  if (raw.blockedDates !== undefined && (!Array.isArray(raw.blockedDates) || raw.blockedDates.length > 90)) bad('Blocked dates must be an array containing at most 90 dates.');
  const blockedDates = [...new Set((raw.blockedDates ?? []).map((value) => date(value, 'Blocked date')))].sort();
  return { startDate, endDate, sessionMinutes, breakMinutes, maxDailyHours: maxDailyMinutes / 60, preferredTime, subjects, availability, blockedDates };
}

function enumerateDates(input) {
  const dates = [];
  for (let value = dateValue(input.startDate); value <= dateValue(input.endDate); value += DAY) {
    const stamp = new Date(value);
    dates.push({ date: stamp.toISOString().slice(0, 10), day: stamp.getUTCDay(), value });
  }
  return dates;
}

function totals(input, sessions) {
  const allocated = new Map(input.subjects.map((subject) => [subject.id, 0]));
  for (const session of sessions) {
    if (allocated.has(session.subjectId)) allocated.set(session.subjectId, allocated.get(session.subjectId) + session.durationMinutes);
  }
  return input.subjects.map((subject) => {
    const requiredMinutes = Math.round(subject.hours * 60);
    const allocatedMinutes = allocated.get(subject.id);
    return {
      subjectId: subject.id,
      name: subject.name,
      requiredMinutes,
      allocatedMinutes,
      unscheduledMinutes: Math.max(0, requiredMinutes - allocatedMinutes),
    };
  });
}

/** Independent checks for generated or model-proposed sessions. Unknown/untrusted session values fail checks. */
export function evaluatePlan(raw, sessions) {
  const input = validateInput(raw);
  const suppliedArray = Array.isArray(sessions) && sessions.length <= MAX_SESSIONS;
  const rows = suppliedArray ? sessions : [];
  const subjects = new Map(input.subjects.map((subject) => [subject.id, subject]));
  const blocked = new Set(input.blockedDates);
  const issues = {
    structure: [], knownSubjects: [], dateBounds: [], availability: [], deadlines: [],
    noOverlap: [], breaks: [], dailyLimit: [], sessionLength: [], workload: [], coverage: [],
  };
  if (!suppliedArray) issues.structure.push(`Sessions must be an array containing at most ${MAX_SESSIONS} entries.`);
  const parsed = [];
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const validObject = object(row);
    const value = validObject ? dateValue(row.date) : null;
    const start = validObject ? timeValue(row.start) : null;
    const end = validObject ? timeValue(row.end, true) : null;
    const validDuration = validObject && Number.isInteger(row.durationMinutes) && row.durationMinutes > 0;
    const shape = validObject && value !== null && start !== null && end !== null && start < end && validDuration && row.durationMinutes === end - start;
    if (!shape) {
      issues.structure.push(`Session ${index + 1} has invalid date, times, or duration.`);
      continue;
    }
    parsed.push({ ...row, value, startMinute: start, endMinute: end, index });
    const subject = subjects.get(row.subjectId);
    if (!subject) issues.knownSubjects.push(`Session ${index + 1} names an unknown subject.`);
    if (row.date < input.startDate || row.date > input.endDate || blocked.has(row.date)) issues.dateBounds.push(`Session ${index + 1} falls outside the planning period or on a blocked date.`);
    if (subject && row.date >= subject.examDate) issues.deadlines.push(`${subject.name} is scheduled on or after its exam date.`);
    const weekday = new Date(value).getUTCDay();
    if (!input.availability.some((window) => window.day === weekday && start >= timeValue(window.start) && end <= timeValue(window.end, true))) issues.availability.push(`Session ${index + 1} falls outside a free-time window.`);
    if (row.durationMinutes > input.sessionMinutes) issues.sessionLength.push(`Session ${index + 1} exceeds the selected session length.`);
  }
  const byDate = new Map();
  for (const row of parsed) {
    if (!byDate.has(row.date)) byDate.set(row.date, []);
    byDate.get(row.date).push(row);
  }
  for (const [day, entries] of byDate) {
    entries.sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute);
    const minutes = entries.reduce((sum, entry) => sum + entry.durationMinutes, 0);
    if (minutes > Math.round(input.maxDailyHours * 60)) issues.dailyLimit.push(`${day} exceeds the daily study limit.`);
    let lastEnd = -Infinity;
    for (const row of entries) {
      if (row.startMinute < lastEnd) issues.noOverlap.push(`${day} has overlapping sessions.`);
      lastEnd = Math.max(lastEnd, row.endMinute);
    }
  }
  const chronological = [...parsed].sort((a, b) => a.value + a.startMinute * MINUTE - b.value - b.startMinute * MINUTE);
  let lastAbsoluteEnd = -Infinity;
  for (const row of chronological) {
    const absoluteStart = row.value + row.startMinute * MINUTE;
    if (absoluteStart - lastAbsoluteEnd < input.breakMinutes * MINUTE) issues.breaks.push(`${row.date} has less than ${input.breakMinutes} minutes between sessions.`);
    lastAbsoluteEnd = Math.max(lastAbsoluteEnd, row.value + row.endMinute * MINUTE);
  }
  const summaries = totals(input, parsed);
  for (const subject of summaries) {
    if (subject.allocatedMinutes > subject.requiredMinutes) issues.workload.push(`${subject.name} exceeds its requested study time.`);
    if (subject.unscheduledMinutes > 0) issues.coverage.push(`${subject.name}: ${subject.unscheduledMinutes} requested minutes remain unscheduled.`);
  }
  const labels = {
    structure: 'Valid session structure', knownSubjects: 'Only selected subjects', dateBounds: 'Planning dates and days off respected',
    availability: 'Inside available hours', deadlines: 'All study before exam dates', noOverlap: 'No overlapping sessions',
    breaks: 'Breaks between sessions', dailyLimit: 'Daily study limit respected', sessionLength: 'Session length respected',
    workload: 'Requested workload not exceeded', coverage: 'Requested study time covered',
  };
  return Object.entries(issues).map(([id, failures]) => ({
    id, label: labels[id], passed: failures.length === 0,
    details: failures.length ? [...new Set(failures)].slice(0, 8).join(' ') : 'Passed.',
  }));
}

/**
 * Deterministic deadline-first heuristic, with priority/difficulty weighting for equal deadlines.
 * It constructs sessions inside explicit free windows; it is not a global optimisation solver.
 */
export function generatePlan(raw) {
  const input = validateInput(raw);
  const blocked = new Set(input.blockedDates);
  const subjects = input.subjects.map((subject) => ({
    ...subject, remaining: Math.round(subject.hours * 60), allocated: 0, count: 0,
  }));
  const sessions = [];
  const evening = input.preferredTime === 'evening';
  let previousDayEnd = -Infinity;
  for (const day of enumerateDates(input)) {
    if (blocked.has(day.date)) continue;
    let dailyRemaining = Math.round(input.maxDailyHours * 60);
    let previousBoundary = evening ? Infinity : -Infinity;
    const windows = input.availability.filter((window) => window.day === day.day);
    if (evening) windows.reverse();
    for (const window of windows) {
      const left = Math.max(timeValue(window.start), (previousDayEnd - day.value) / MINUTE + input.breakMinutes);
      const right = timeValue(window.end, true);
      if (left >= right) continue;
      let cursor = evening ? Math.min(right, previousBoundary - input.breakMinutes) : Math.max(left, previousBoundary + input.breakMinutes);
      while (dailyRemaining > 0 && (evening ? cursor > left : cursor < right)) {
        const available = subjects.filter((subject) => subject.remaining > 0 && day.date < subject.examDate);
        if (!available.length) break;
        available.sort((a, b) => {
          const deadline = a.examDate.localeCompare(b.examDate);
          if (deadline) return deadline;
          // Equal deadlines receive weighted progress sharing, so priorities influence the order.
          const progressA = a.allocated / ((a.priority + a.difficulty / 3) * Math.round(a.hours * 60));
          const progressB = b.allocated / ((b.priority + b.difficulty / 3) * Math.round(b.hours * 60));
          return progressA - progressB || b.priority - a.priority || b.difficulty - a.difficulty || a.id.localeCompare(b.id);
        });
        const subject = available[0];
        const duration = Math.min(subject.remaining, input.sessionMinutes, dailyRemaining, evening ? cursor - left : right - cursor);
        const start = evening ? cursor - duration : cursor;
        const end = start + duration;
        const topic = subject.topics.length ? subject.topics[subject.count % subject.topics.length] : 'Core concepts and practice';
        const revision = subject.allocated >= Math.round(subject.hours * 60) * 0.7;
        sessions.push({
          id: '', subjectId: subject.id, subjectName: subject.name, date: day.date,
          start: time(start), end: time(end), durationMinutes: duration, topic,
          type: revision ? 'revision' : 'study',
          reason: `Exam on ${subject.examDate}; ${['', 'low', 'medium', 'high'][subject.priority]} priority. ${revision ? 'Review and recall' : 'Focused study'} within your available hours.`,
          completed: false,
        });
        subject.remaining -= duration;
        subject.allocated += duration;
        subject.count++;
        dailyRemaining -= duration;
        previousBoundary = evening ? start : end;
        cursor = evening ? start - input.breakMinutes : end + input.breakMinutes;
      }
    }
    for (let index = sessions.length - 1; index >= 0 && sessions[index].date === day.date; index--) {
      previousDayEnd = Math.max(previousDayEnd, day.value + timeValue(sessions[index].end, true) * MINUTE);
    }
  }
  sessions.sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start) || a.subjectId.localeCompare(b.subjectId));
  const chronologicalProgress = new Map(input.subjects.map((subject) => [subject.id, { minutes: 0, count: 0 }]));
  sessions.forEach((session, index) => {
    session.id = `session-${String(index + 1).padStart(4, '0')}`;
    const subject = input.subjects.find((entry) => entry.id === session.subjectId);
    const progress = chronologicalProgress.get(subject.id);
    const revision = progress.minutes >= Math.round(subject.hours * 60) * 0.7;
    session.type = revision ? 'revision' : 'study';
    session.topic = subject.topics.length ? subject.topics[progress.count % subject.topics.length] : 'Core concepts and practice';
    session.reason = `Exam on ${subject.examDate}; ${['', 'low', 'medium', 'high'][subject.priority]} priority. ${revision ? 'Review and recall' : 'Focused study'} within your available hours.`;
    progress.minutes += session.durationMinutes;
    progress.count++;
  });
  const subjectSummaries = totals(input, sessions);
  const requiredMinutes = subjectSummaries.reduce((sum, subject) => sum + subject.requiredMinutes, 0);
  const allocatedMinutes = sessions.reduce((sum, session) => sum + session.durationMinutes, 0);
  const unscheduledMinutes = Math.max(0, requiredMinutes - allocatedMinutes);
  const warnings = [];
  for (const subject of subjectSummaries) {
    if (!subject.unscheduledMinutes) continue;
    const original = input.subjects.find((entry) => entry.id === subject.subjectId);
    warnings.push(original.examDate <= input.startDate
      ? `${subject.name}: its exam is on or before the planning start. ${subject.unscheduledMinutes} minutes could not be scheduled.`
      : `${subject.name}: ${subject.unscheduledMinutes} minutes could not fit before the exam. Add available hours, extend the plan before the exam, or reduce the requested workload.`);
  }
  for (const subject of input.subjects) {
    const covered = new Set(sessions.filter(s=>s.subjectId===subject.id).map(s=>s.topic));
    const missing = [...new Set(subject.topics)].filter(topic=>!covered.has(topic));
    if(missing.length) warnings.push(`${subject.name}: ${missing.length} syllabus topic(s) have no session yet: ${missing.slice(0,5).join(', ')}${missing.length>5?'…':''}. Increase the study goal and available time, or use shorter sessions.`);
  }
  const checks = evaluatePlan(input, sessions);
  return {
    sessions, warnings, checks, subjectSummaries,
    stats: {
      requiredMinutes, allocatedMinutes, unscheduledMinutes,
      coveragePercent: Math.round(allocatedMinutes / requiredMinutes * 1000) / 10,
      sessionCount: sessions.length, studyDays: new Set(sessions.map((session) => session.date)).size,
      feasible: unscheduledMinutes === 0 && checks.every((check) => check.passed),
    },
  };
}
