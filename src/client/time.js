// Split out of engine.js so the splash and birth-input screens can format
// dates without pulling in the 만세력 tables.
import {DateTime} from 'luxon';
export const now=()=>DateTime.now().setZone('Asia/Seoul');
export const dateLabel=d=>DateTime.fromISO(d).setLocale('ko').toFormat('M월 d일');
