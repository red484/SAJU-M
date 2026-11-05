export function birthDayCount(year, month, calendar) {
  if (calendar === 'lunar' || !year || !month) return calendar === 'lunar' ? 30 : 31;
  return new Date(Number(year), Number(month), 0).getDate();
}
const dayOptions = (count, selected) => `<option value="">일</option>${Array.from({length:count},(_,i)=>`<option value="${i+1}" ${i+1===selected?'selected':''}>${i+1}일</option>`).join('')}`;
export function birthPicker(value, currentYear) {
  const [year, month, day] = value ? value.split('-').map(Number) : [];
  const option = (n, selected, suffix) => `<option value="${n}" ${n===selected?'selected':''}>${n}${suffix}</option>`;
  // Recent years first, so nobody scrolls past a century to reach their own.
  const years = Array.from({length:currentYear-1899},(_,i)=>option(currentYear-i,year,'년')).join('');
  const months = Array.from({length:12},(_,i)=>option(i+1,month,'월')).join('');
  return `<fieldset class="birth-picker"><legend>생년월일</legend><div class="birth-selects"><select name="birthYear" aria-label="태어난 연도"><option value="">연도</option>${years}</select><select name="birthMonth" aria-label="태어난 월"><option value="">월</option>${months}</select><select name="birthDay" aria-label="태어난 일">${dayOptions(31,day)}</select></div><input type="hidden" name="birth" value="${value||''}"></fieldset>`;
}
export function bindBirthPicker(form) {
  const fields=form.elements;
  const sync=()=>{
    const count=birthDayCount(fields.birthYear.value,fields.birthMonth.value,fields.calendar.value);
    const day=Math.min(Number(fields.birthDay.value),count);
    fields.birthDay.innerHTML=dayOptions(count,day);
    fields.birth.value=fields.birthYear.value&&fields.birthMonth.value&&day?[fields.birthYear.value,fields.birthMonth.value.padStart(2,'0'),String(day).padStart(2,'0')].join('-'):'';
  };
  for(const key of ['birthYear','birthMonth','birthDay','calendar'])fields[key].addEventListener('change',sync);
  sync();
}
