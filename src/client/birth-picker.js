export function birthDayCount(year, month, calendar) {
  return calendar === 'lunar' ? 30 : new Date(Number(year), Number(month), 0).getDate();
}
export function birthPicker(value, currentYear) {
  const [year, month, day] = value.split('-').map(Number);
  const options = (count, start, selected, suffix) => Array.from({length:count},(_,i)=> {
    const n=start+i;
    return `<option value="${n}" ${n===selected?'selected':''}>${n}${suffix}</option>`;
  }).join('');
  return `<fieldset class="birth-picker"><legend>생년월일</legend><div class="birth-selects"><select name="birthYear" aria-label="태어난 연도">${options(currentYear-1899,1900,year,'년')}</select><select name="birthMonth" aria-label="태어난 월">${options(12,1,month,'월')}</select><select name="birthDay" aria-label="태어난 일">${options(31,1,day,'일')}</select></div><input type="hidden" name="birth" value="${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}"></fieldset>`;
}
export function bindBirthPicker(form) {
  const fields=form.elements;
  const sync=()=>{
    const count=birthDayCount(fields.birthYear.value,fields.birthMonth.value,fields.calendar.value);
    const day=Math.min(Number(fields.birthDay.value),count);
    fields.birthDay.innerHTML=Array.from({length:count},(_,i)=>`<option value="${i+1}" ${i+1===day?'selected':''}>${i+1}일</option>`).join('');
    fields.birth.value=[fields.birthYear.value,fields.birthMonth.value.padStart(2,'0'),String(day).padStart(2,'0')].join('-');
  };
  for(const key of ['birthYear','birthMonth','birthDay','calendar'])fields[key].addEventListener('change',sync);
  sync();
}
