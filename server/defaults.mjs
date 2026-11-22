export function emptyConfig(now = new Date()) {
  const local = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const parts = local.match(/\d+/g);
  const iso = parts[0].length === 4 ? local : `${parts[2]}-${parts[0]}-${parts[1]}`;
  const day = n => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
  return {
    startDate: day(0), endDate: day(13), sessionMinutes: 50, breakMinutes: 10,
    maxDailyHours: 4, preferredTime: 'balanced', blockedDates: [],
    subjects: [], availability: []
  };
}

// Used to recognize the bundled demo from version 1.
export function sampleConfig(now = new Date()) {
  const base = emptyConfig(now);
  const day = n => new Date(Date.parse(base.startDate+'T00:00:00Z') + n * 86400000).toISOString().slice(0,10);
  return {
    ...base,
    subjects: [
      { id: 'math', name: 'Engineering Mathematics', examDate: day(10), hours: 8, priority: 3, difficulty: 3, topics: ['Linear algebra', 'Probability', 'Differential equations'] },
      { id: 'dsa', name: 'Data Structures', examDate: day(12), hours: 7, priority: 3, difficulty: 2, topics: ['Trees & graphs', 'Sorting algorithms', 'Dynamic programming'] },
      { id: 'dbms', name: 'Database Systems', examDate: day(14), hours: 6, priority: 2, difficulty: 2, topics: ['SQL practice', 'Normalization', 'Transactions'] },
      { id: 'pe', name: 'Prompt Engineering', examDate: day(16), hours: 5, priority: 2, difficulty: 1, topics: ['Prompt patterns', 'Structured outputs', 'Evaluation methods'] }
    ],
    availability: [0, 1, 2, 3, 4, 5, 6].map(day => ({ day, start: day === 0 || day === 6 ? '09:00' : '17:00', end: day === 0 || day === 6 ? '13:00' : '21:00' }))
  };
}
