// Conservative common formats, not a general PII detector or identity validator.
// Bounded runs and explicit boundaries avoid partial matches inside IDs/long digit strings.
const email = /(?<![A-Za-z0-9.!#$%&'*+/=?^_\x60{|}~-])[A-Za-z0-9.!#$%&'*+/=?^_\x60{|}~-]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?\.[A-Za-z]{2,63}(?![A-Za-z0-9_-])/g;
const mobile = /(?<![A-Za-z0-9])(?:010|\+82[ .-]{0,3}10)[ .-]{0,3}\d{4}[ .-]{0,3}\d{4}(?![A-Za-z0-9])/g;
export function redactContactText(text) {
 return typeof text==='string'?text.replace(email,'[이메일 비공개]').replace(mobile,'[휴대전화 비공개]'):text;
}
export function redactModelMessages(messages) {
 if(!Array.isArray(messages))return messages;
 return messages.map(message=>{
  if(!message||typeof message!=='object')return message;
  const content=Array.isArray(message.content)?message.content.map(part=>typeof part==='string'?redactContactText(part):part&&typeof part.text==='string'?{...part,text:redactContactText(part.text)}:part):redactContactText(message.content);
  return {...message,content};
 });
}
