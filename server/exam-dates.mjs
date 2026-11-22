const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
const month = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const sep = '[\\s./-]+';
const dates = new RegExp('\\b(?:\\d{4}[-/.]\\d{1,2}[-/.]\\d{1,2}|\\d{1,2}[-/.]\\d{1,2}[-/.](?:\\d{4}|\\d{2})|\\d{1,2}(?:st|nd|rd|th)?'+sep+month+sep+'\\d{2,4}|'+month+'\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{4})\\b','gi');

function isoDate(raw) {
  const parts = raw.toLowerCase().replace(/(\d)(st|nd|rd|th)\b/g,'$1').split(/[\s,./-]+/);
  let [day, mon, year] = parts;
  if (day.length === 4 && /^\d+$/.test(day)) [year,mon,day] = parts;
  else if (/^[a-z]/.test(day)) [mon,day,year] = parts;
  if (/^[a-z]/.test(mon)) mon = months.indexOf(mon.slice(0,3)) + 1;
  const iso = [year.length === 2 ? '20'+year : year, String(mon).padStart(2,'0'), day.padStart(2,'0')].join('-');
  const time = Date.parse(iso+'T00:00:00Z');
  return Number.isFinite(time) && new Date(time).toISOString().startsWith(iso+'T') ? iso : null;
}

export function examDates(text) {
  const rows = [];
  for (const line of text.split(/\r\n?|\n/)) {
    for (const match of line.matchAll(dates)) {
      const date = isoDate(match[0]);
      if (date) rows.push({date, label:line.trim().slice(0,400)});
    }
  }
  return rows;
}
