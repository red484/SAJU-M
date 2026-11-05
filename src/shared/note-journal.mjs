// Note mode exchanges record fields only. Hidden web fields stay on the server.
export const NOTE_RECORD_FIELDS=Object.freeze(['id','title','date','topic','confidence','expectation','criteriaLabel','nextAction','due','result','mood','actual','conversationId','created','legacy']);
const fields=new Set(NOTE_RECORD_FIELDS);
const noteRecord=record=>Object.fromEntries(Object.entries(record).filter(([key])=>fields.has(key)));
export function noteJournal(data){
 return data?{profile:null,records:(data.records||[]).map(noteRecord),conversations:[],savedAnswers:[]}:null;
}
export function validNoteRecords(records){
 if(!Array.isArray(records))return false;
 const ids=new Set();
 return records.every(record=>{
  if(!record||typeof record!=='object'||Array.isArray(record)||typeof record.id!=='string'||!record.id||record.id.length>128||ids.has(record.id))return false;
  ids.add(record.id);
  return Object.entries(noteRecord(record)).every(([,value])=>value===null||['string','number','boolean'].includes(typeof value));
 });
}
export function applyNoteRecords(current,records){
 const previous=new Map((current?.records||[]).map(record=>[record.id,record]));
 return {...(current||{profile:null,conversations:[],savedAnswers:[]}),records:records.map(record=>({
  ...Object.fromEntries(Object.entries(previous.get(record.id)||{}).filter(([key])=>!fields.has(key))),...noteRecord(record)
 }))};
}
