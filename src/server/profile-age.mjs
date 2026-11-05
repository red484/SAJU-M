import KoreanLunarCalendar from 'korean-lunar-calendar';
import {ageEligibility} from '../shared/age-policy.mjs';
export function eligibleProfile(profile,today) {
 if(!profile)return true;
 let birth=profile.birth;
 if(profile.calendar==='lunar'){
  if(typeof birth!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(birth))return false;
  const calendar=new KoreanLunarCalendar(),[y,m,d]=birth.split('-').map(Number);
  if(!calendar.setLunarDate(y,m,d,!!profile.leap))return false;
  const solar=calendar.getSolarCalendar();birth=[solar.year,String(solar.month).padStart(2,'0'),String(solar.day).padStart(2,'0')].join('-');
 }
 return ageEligibility(birth,today);
}
