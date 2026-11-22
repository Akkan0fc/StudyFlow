let input='';for await(const chunk of process.stdin)input+=chunk;
const workerData=JSON.parse(input);workerData.data=Buffer.from(workerData.base64,'base64');
console.log=console.warn=console.error=()=>{};
const reply=value=>process.stdout.write(JSON.stringify(value));
try {
  let text;
  if(workerData.ext==='pdf') {
    const {PDFParse}=await import('pdf-parse');
    const parser=new PDFParse({data:new Uint8Array(workerData.data),isEvalSupported:false});
    try{const info=await parser.getInfo();if(info.total>100)throw new Error('Upload at most 100 PDF pages at a time.');text=(await parser.getText({pageJoiner:''})).text;}finally{await parser.destroy();}
  } else {
    const mammoth=await import('mammoth');
    const source = {buffer:Buffer.from(workerData.data)};
    const options = {externalFileAccess:false};
    if (workerData.kind === 'dates') {
      // Mammoth emits normalized table markup. Keep each exam row on one line.
      const {value} = await mammoth.convertToHtml(source, {...options, convertImage: mammoth.images.imgElement(() => ({}))});
      text = value.replace(/<tr\b[^>]*>[\s\S]*?<\/tr>/g, row =>
        '\n'+row.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim()+'\n')
        .replace(/<\/(?:p|h[1-6])>/g,'\n').replace(/<[^>]+>/g,'')
        .replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&amp;/g,'&');
    } else text = (await mammoth.extractRawText(source,options)).value;
  }
  reply({text});
}catch(error){reply({error:/100 PDF pages/.test(error.message)?error.message:'The document could not be read. Use an unencrypted text-based PDF, DOCX or TXT file.'});}
