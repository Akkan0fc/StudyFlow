function csvCell(value) {
  let text = String(value ?? '');
  if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function exportCSV(plan) {
  const rows = [['Date', 'Start', 'End', 'Subject', 'Topic', 'Type', 'Minutes', 'Completed', 'Reason'],
    ...plan.sessions.map(s => [s.date, s.start, s.end, s.subjectName, s.topic, s.type, s.durationMinutes, s.completed ? 'Yes' : 'No', s.reason])];
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

function escapeICS(value) { return String(value).replaceAll('\\', '\\\\').replaceAll('\r', '').replaceAll('\n', '\\n').replaceAll(';', '\\;').replaceAll(',', '\\,'); }
function stamp(date, time) {
  if (time === '24:00') { date = new Date(Date.parse(`${date}T00:00:00Z`) + 86400000).toISOString().slice(0, 10); time = '00:00'; }
  return date.replaceAll('-', '') + 'T' + time.replace(':', '') + '00';
}
function fold(line) {
  const lines = [];
  let current = '';
  for (const char of line) {
    if (Buffer.byteLength(current + char) > 75) { lines.push(current); current = ' '; }
    current += char;
  }
  lines.push(current);
  return lines.join('\r\n');
}
export function exportICS(plan) {
  const created = new Date(plan.createdAt).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//StudyFlow//C20 Study Planner//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:StudyFlow Study Plan'];
  for (const s of plan.sessions) lines.push('BEGIN:VEVENT', `UID:${plan.id}-${s.id}@studyflow.local`, `DTSTAMP:${created}`,
    `DTSTART:${stamp(s.date, s.start)}`, `DTEND:${stamp(s.date, s.end)}`,
    `SUMMARY:${escapeICS(`${s.subjectName} - ${s.topic}`)}`, `DESCRIPTION:${escapeICS(`${s.reason}\n${s.completed ? 'Completed' : 'Planned'} | ${s.durationMinutes} minutes`)}`, 'END:VEVENT');
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
