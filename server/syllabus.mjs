import {examDates} from './exam-dates.mjs';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
// Prefer a labelled course title over the document heading (often a university name).
function syllabusTitle(lines) {
  const header = lines.slice(0, 40).map(line => line.trim().replace(/^#{1,6}\s+/, '').replace(/\*\*|__/g, '').trim());
  const label = /^(?:(?:course|subject|paper)\s+(?:name|title)\b\s*[:–—-]?\s*|(?:course|subject|paper)\s*[:–—-]\s*)(.*)$/i;
  const unit = /^(?:unit|module|chapter)\s+[\divxlc]+\b/i;
  const generic = /^(?:syllabus|course outline|course content|topics?|credits?|semester|course code|course outcomes?|learning outcomes?|department|faculty|school|university|institute|programme|program)\b/i;
  const usable = name => name && name.length <= 120 && /\p{L}/u.test(name) && !generic.test(name) && !unit.test(name);
  for (const [index, line] of header.entries()) {
    const match = line.match(label);
    if (!match) continue;
    let end = index;
    if (!match[1]) {
      while (end + 1 < header.length && !header[end + 1]) end++;
      end++;
    }
    const name = match[1] || header[end];
    if (usable(name) && !label.test(name)) return {name, start:index, end};
  }
  for (const [index, line] of header.entries()) {
    const match = line.match(/^(?:syllabus|course outline)\s*(?:for\s+|[:–—-]\s*)(.+)$/i)
      || line.match(/^(.+?)\s+(?:[-–—:]\s*)?(?:syllabus|course outline)$/i);
    if (match && usable(match[1])) return {name:match[1].trim(), start:index, end:index};
  }
  const first = header.findIndex(line => line && !generic.test(line));
  const name = header[first];
  const next = header.slice(first + 1).find(Boolean) || '';
  if (usable(name) && !/^[-*•\d]/.test(name) && !/\b(?:university|college|institute)\b/i.test(name) &&
      (/^#\s/.test(lines[first].trim()) || unit.test(next) || /^(?:syllabus|course outline)$/i.test(next))) {
    return {name, start:first, end:first};
  }
}
export function topicCandidates(text) {
  const warnings=[],topics=[],seen=new Set();
  for(let line of text.replace(/\r/g,'').split(/\n|[;•●]/)) {
    line=line.trim().replace(/^\s*(?:[-*–▪]\s*|\d+(?:\.\d+)*[.)]?\s+|[a-z][.)]\s+)/i,'').replace(/^#{1,6}\s*/,'');
    if(/^(?:syllabus|course (?:outline|content|code|title|outcomes)|references|textbooks|assessment|credits|page\s*\d|total hours|learning outcomes)\b/i.test(line))continue;
    line=line.replace(/^(?:unit|module|chapter)\s+[\divxlc]+\s*[:–—.-]?\s*/i,'').replace(/\s*\(\d+\s*(?:hours?|hrs?|lectures?)\)\s*$/i,'').trim();
    if(line.length<3 || /^[-\d\s/]+$/.test(line))continue;
    if(line.length>200){warnings.push('Some long lines need editing; only their first 200 characters were suggested.');line=line.slice(0,200);}
    const key=line.toLowerCase();if(!seen.has(key)){seen.add(key);topics.push(line);}
  }
  if(topics.length>50)warnings.push('More than 50 topics were found. Review the first 50, or import separate subjects.');
  return {topics:topics.slice(0,50),warnings:[...new Set(warnings)]};
}
export async function extractSyllabus({filename,base64,kind='syllabus'}={}) {
  if(typeof filename!=='string'||!filename.trim()||filename.length>240)throw fail('Choose a syllabus file with a short filename.');
  const ext=filename.toLowerCase().match(/\.(pdf|docx|txt|md|csv)$/)?.[1];
  if(!ext || (ext==='csv' && kind!=='dates'))throw fail('Use a PDF, DOCX, TXT or Markdown syllabus.');
  if(typeof base64!=='string'||!base64.length||base64.length>7_000_000)throw fail('Upload a non-empty file up to 5 MB.',413);
  if(base64.length%4 || /[^A-Za-z0-9+/=]/.test(base64))throw fail('The file encoding is invalid. Select the file again.');
  const data=Buffer.from(base64,'base64');if(!data.length||data.length>5*1024*1024)throw fail('Upload a non-empty file up to 5 MB.',413);
  if(data.toString('base64')!==base64)throw fail('The file encoding is invalid. Select the file again.');
  if(ext==='pdf'&&!data.subarray(0,1024).includes(Buffer.from('%PDF-')))throw fail('This file is not a readable PDF.',422);
  if(ext==='docx')validateZip(data);
  let text;
  if(['txt','md','csv'].includes(ext)) {
    try{text=new TextDecoder('utf-8',{fatal:true}).decode(data);}catch{throw fail('Save the text syllabus as UTF-8 and try again.',422);}
  } else text=await parseDocument(data,ext,kind);
  text=text.replace(/\0/g,'').trim();
  if(text.length<5)throw fail('No readable text was found. Scanned PDFs need OCR first; upload a text-based PDF, DOCX or TXT file.',422);
  if(text.length>100000)throw fail('The extracted syllabus exceeds 100,000 characters. Upload a smaller subject section.',413);
  if (kind === 'dates') return {dates:examDates(text), text};
  const filenameOnly = filename.split(/[\\/]/).at(-1);
  const lines = text.split(/\r\n?|\n/);
  const explicitHeading = /^[#*\s]*(?:course|subject|paper)\s*(?:(?:name|title)\b|:)/i;
  const markdownHeading = /^#\s+(.+)/;
  const headers = lines.some(line=>explicitHeading.test(line)) ? explicitHeading : markdownHeading;
  const sections = [];
  let section = [], hasHeader = false;
  for (const line of lines) {
    if (headers.test(line) && (headers === explicitHeading || syllabusTitle([line]))) {
      if (hasHeader) { sections.push(section); section = []; }
      hasHeader = true;
    }
    section.push(line);
  }
  sections.push(section);
  const courses = sections.map(lines => {
    const title = syllabusTitle(lines);
    const content = lines.filter((line, i) => !(title && i >= title.start && i <= title.end)
      && !/^\s*(?:exam(?:ination)?\s+date|date of exam)\b/i.test(line)).join('\n');
    const examLines = lines.filter(line => /\b(?:exam(?:ination)?\s+date|date of exam)\b/i.test(line));
    const dates = [...new Set(examDates(examLines.join('\n')).map(row => row.date))];
    const code = lines.join('\n').match(/\b(?:course|subject|paper)\s+code\s*[:–-]?\s*([a-z]{2,}[- ]?\d[\w-]*)/i)?.[1] || '';
    return {subjectName:title?.name || '', code, examDate:dates.length===1 ? dates[0] : '', ...topicCandidates(content)};
  });
  return {filename:filenameOnly, text, ...courses[0], courses,
    warnings:['Review the suggested topics: headings, references and wrapped PDF lines may need editing.', ...courses[0].warnings]};
}
function validateZip(data) {
  // Inspect central-directory size declarations before handing DOCX to the parser.
  let end=-1;for(let i=data.length-22;i>=Math.max(0,data.length-65557);i--)if(data.readUInt32LE(i)===0x06054b50){end=i;break;}
  if(end<0)throw fail('This file is not a readable DOCX document.',422);
  const count=data.readUInt16LE(end+10);let at=data.readUInt32LE(end+16),size=0,document=false;
  if(count>2000||data.readUInt16LE(end+4)!==0)throw fail('The DOCX archive is too complex.',413);
  for(let n=0;n<count;n++){
    if(at+46>data.length||data.readUInt32LE(at)!==0x02014b50)throw fail('The DOCX archive is damaged.',422);
    size+=data.readUInt32LE(at+24);const len=data.readUInt16LE(at+28),extra=data.readUInt16LE(at+30),comment=data.readUInt16LE(at+32);
    if(size>30*1024*1024)throw fail('The DOCX expands beyond the 30 MB limit. Remove embedded media.',413);
    if(data.subarray(at+46,at+46+len).toString()==='word/document.xml')document=true;
    at+=46+len+extra+comment;
  }
  if(!document)throw fail('The archive does not contain a Word document.',422);
}
function parseDocument(data,ext,kind) {
  return new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,['--max-old-space-size=256',fileURLToPath(new URL('./syllabus-worker.mjs',import.meta.url))],{stdio:['pipe','pipe','ignore'],windowsHide:true});
    child.stdout.setEncoding('utf8');
    let output='',settled=false;
    function finish(error,value){if(settled)return;settled=true;clearTimeout(timer);child.kill();error?reject(error):resolve(value);}
    const timer=setTimeout(()=>finish(fail('This document took too long to read. Upload a smaller subject section.',422)),25000);
    child.stdout.on('data',chunk=>{output+=chunk.toString('utf8');if(output.length>1_000_000)finish(fail('The extracted syllabus is too large. Upload a smaller section.',413));});
    child.on('error',()=>finish(fail('The document reader could not start. Try a TXT syllabus.',422)));
    child.stdin.on('error',()=>{});
    child.on('close',()=>{if(settled)return;try{const result=JSON.parse(output);finish(result.error?fail(result.error,422):null,result.text);}catch{finish(fail('The document could not be read. Try a smaller unencrypted PDF, DOCX or TXT.',422));}});
    child.stdin.end(JSON.stringify({ext,kind,base64:data.toString('base64')}));
  });
}
