import { CITIES, HOURS } from './constants.js';

export function countryForCity(city) {
  const zone = CITIES.find(row => row[0] === city)?.[1] || '';
  if (zone === 'Asia/Seoul') return '한국';
  if (zone === 'Asia/Tokyo') return '일본';
  if (['Asia/Shanghai', 'Asia/Hong_Kong'].includes(zone)) return '중국·홍콩';
  if (zone === 'Asia/Singapore') return '싱가포르';
  if (zone.startsWith('Australia/')) return '호주';
  if (['America/Toronto', 'America/Vancouver'].includes(zone)) return '캐나다';
  if (zone.startsWith('America/')) return '미국';
  return ({'Europe/London':'영국','Europe/Paris':'프랑스','Europe/Berlin':'독일'})[zone] || '기타';
}

export function hourIndex(time) {
  const [h, m] = time.split(':').map(Number);
  return Math.floor(((h * 60 + m + 60) % 1440) / 120);
}

export function improveBirthForm(profile) {
  const form = document.getElementById('birth-form');
  if (!form) return;
  const time = form.elements.time;
  const label = time.closest('label');
  const picker = document.createElement('select');
  picker.setAttribute('aria-label', '태어난 시간대');
  HOURS.forEach(([name, start, end], i) => picker.add(new Option(`${start}~${end} · ${name}시`, String(i))));
  picker.options[0].text = '00:00~01:00 · 자시 (새벽)';
  picker.add(new Option('23:00~24:00 · 자시 (밤)', 'late'));
  picker.add(new Option('정확한 시간 직접 입력', 'exact'));
  // Preserve existing exact times; selecting a range deliberately uses its midpoint.
  picker.value = profile ? 'exact' : String(hourIndex(time.value));
  label.hidden = !profile;
  label.before(picker);
  const caption = document.createElement('label');
  caption.textContent = '태어난 시간';
  picker.before(caption);
  caption.append(picker);
  label.firstChild.textContent = '정확한 시간';
  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.textContent = '시간대만 알면 자시·축시로 선택하세요. 구간의 중간 시각으로 계산하며, 날짜·절기 경계에서는 정확한 시간을 권장해요. 자시는 23~01시, 축시는 01~03시예요.';
  label.after(hint);
  picker.addEventListener('change', () => {
    label.hidden = picker.value !== 'exact';
    if (picker.value !== 'exact') {
      const index = Number(picker.value);
      time.value = picker.value === 'late' ? '23:30' : index === 0 ? '00:30' : `${String(index * 2).padStart(2, '0')}:00`;
    }
  });
  if (!profile) picker.dispatchEvent(new Event('change'));
  const sync = () => { picker.disabled = form.elements.unknown.checked; };
  form.elements.unknown.addEventListener('change', sync);
  sync();

  const city = form.elements.city;
  const cityLabel = city.closest('label');
  const country = document.createElement('select');
  const countryLabel = document.createElement('label');
  countryLabel.textContent = '태어난 국가';
  countryLabel.append(country);
  cityLabel.before(countryLabel);
  ['한국','미국','일본','중국·홍콩','캐나다','호주','영국','프랑스','독일','싱가포르','기타'].forEach(name => country.add(new Option(name, name)));
  country.value = countryForCity(city.value);
  const precise = document.getElementById('precise');
  const locationHint = document.createElement('p');
  locationHint.className = 'hint';
  locationHint.textContent = '한국은 서울 기준이에요. 다른 지역이나 해외 출생은 지역·시간대를 확인해 주세요.';
  countryLabel.after(locationHint);
  const update = (keep) => {
    const previous = city.value;
    const rows = CITIES.filter(row => countryForCity(row[0]) === country.value);
    city.replaceChildren(...rows.map(row => new Option(row[0], row[0])));
    city.add(new Option('직접 입력', '직접 입력'));
    city.value = keep && (rows.some(row => row[0] === previous) || previous === '직접 입력') ? previous : rows[0]?.[0] || '직접 입력';
    cityLabel.firstChild.textContent = '출생 지역 · 시간대 확인';
    if (country.value === '한국') precise.querySelector('summary').after(cityLabel);
    else locationHint.after(cityLabel);
    if (!keep) city.dispatchEvent(new Event('change'));
    if (country.value === '기타') precise.open = true;
  };
  country.addEventListener('change', () => update(false));
  update(true);
}

export function collapseChart() {
  const section = document.getElementById('chart');
  const heading = section?.querySelector('.block-title');
  if (!heading) return;
  const details = document.createElement('details');
  details.className = 'chart-disclosure';
  const summary = document.createElement('summary');
  summary.textContent = '상세 명식과 계산 근거 보기';
  details.append(summary);
  heading.remove();
  details.append(...section.childNodes);
  section.append(details);
  document.querySelectorAll('[data-jump="chart"],a[href="#chart"]').forEach(link => link.addEventListener('click', () => { details.open = true; }));
}
