import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {extractSyllabus,topicCandidates} from '../server/syllabus.mjs';
import {generatePlan} from '../server/scheduler.mjs';
const upload=(filename,text)=>({filename,base64:Buffer.from(text).toString('base64')});
function pdf(text){
  const stream=`BT /F1 12 Tf 50 750 Td (${text}) Tj ET`;
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let data='%PDF-1.4\n',offsets=[0];objects.forEach((o,i)=>{offsets.push(Buffer.byteLength(data));data+=`${i+1} 0 obj\n${o}\nendobj\n`;});const start=Buffer.byteLength(data);data+=`xref\n0 6\n0000000000 65535 f \n`+offsets.slice(1).map(n=>`${String(n).padStart(10,'0')} 00000 n \n`).join('')+`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;return data;
}
test('UTF-8 syllabus strips bullets and headings, preserves non-English topics, and deduplicates',async()=>{
  const r=await extractSyllabus(upload('course.txt','Syllabus\n1. Arrays\n• Linked lists\n- Arrays\nModule II: Trees\nअल्गोरिदम'));
  assert.equal(r.subjectName,'');
  assert.deepEqual(r.topics,['Arrays','Linked lists','Trees','अल्गोरिदम']);assert.ok(r.warnings.length);
});
test('syllabus content supplies the subject name and keeps it out of topics', async () => {
  for (const header of ['**Course Title:** Operating Systems', 'Subject Name\n\nOperating Systems',
    '# Operating Systems', 'Syllabus for Operating Systems', 'Operating Systems – Syllabus', 'Operating Systems']) {
    const result = await extractSyllabus(upload('download.md', header + '\nUnit I: Scheduling'));
    assert.equal(result.subjectName, 'Operating Systems', header);
    assert.deepEqual(result.topics, ['Scheduling'], header);
  }
});
test('topic candidates cap count and length with visible warnings',()=>{const r=topicCandidates(Array.from({length:55},(_,i)=>`Topic ${i} ${'x'.repeat(220)}`).join('\n'));assert.equal(r.topics.length,50);assert.ok(r.topics.every(t=>t.length<=200));assert.equal(r.warnings.length,2);});
test('text-based PDF produces reviewable extracted text',async()=>{const r=await extractSyllabus(upload('sample.pdf',pdf('Arrays and linked lists')));assert.match(r.text,/Arrays and linked lists/);assert.ok(r.topics.some(t=>t.includes('Arrays')));});
test('DOCX paragraphs become plain text topics without rendering HTML',async()=>{
  const zip=new JSZip();zip.file('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Probability</w:t></w:r></w:p><w:p><w:r><w:t>Linear algebra</w:t></w:r></w:p></w:body></w:document>');
  const r=await extractSyllabus({filename:'sample.docx',base64:await zip.generateAsync({type:'base64'})});assert.deepEqual(r.topics,['Probability','Linear algebra']);
});
test('empty, unsupported, forged and oversized uploads are rejected',async()=>{
  for(const value of [upload('test.exe','Some text'),upload('fake.pdf','notPDF'),upload('fake.docx','notZIP'),upload('empty.txt',''),{filename:'text.txt',base64:'!!!'}])await assert.rejects(extractSyllabus(value));
  await assert.rejects(extractSyllabus(upload('large.txt','a'.repeat(100001))),e=>e.status===413);
});
test('empty PDF text explains that scans need OCR',async()=>{await assert.rejects(extractSyllabus(upload('scan.pdf',pdf(''))),/OCR/);});
test('unallocated syllabus topics are explicit even with full hour coverage',()=>{
  const plan=generatePlan({startDate:'2026-11-09',endDate:'2026-11-09',sessionMinutes:50,breakMinutes:5,maxDailyHours:1,preferredTime:'balanced',blockedDates:[],availability:[{day:1,start:'17:00',end:'18:00'}],subjects:[{id:'x',name:'Course',examDate:'2026-11-10',hours:0.5,priority:2,difficulty:2,topics:['Arrays','Trees','Graphs']}]});
  assert.equal(plan.stats.coveragePercent,100);assert.ok(plan.warnings.some(w=>w.includes('2 syllabus topic(s)')));
});
