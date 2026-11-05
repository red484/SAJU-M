import {clearTossLogin} from './api/auth.js';
import {setMetricsEnabled} from './product-metrics.js';
import {clearReviewReminders} from './native-shell.js';
export async function clearDeletedDeviceStorage() {
 clearTossLogin();
 try {
  for(let i=sessionStorage.length-1;i>=0;i--){const key=sessionStorage.key(i);if(key==='ongi-concern-draft'||key?.startsWith('ongi-concern-draft:'))sessionStorage.removeItem(key);}
 }catch{}
 try{localStorage.removeItem('dalbit-v2');localStorage.removeItem('dalbit-guest-mode');}catch{}
 setMetricsEnabled(false);
 await clearReviewReminders();
}
