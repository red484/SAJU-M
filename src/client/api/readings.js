import { apiRequest } from './client.js';

export const coachStatus = () => apiRequest('/api/coach');
export const requestCoach = (payload, timeout = 25_000) => apiRequest('/api/coach', {
  method: 'POST', body: JSON.stringify(payload), timeout
});
// 응답 품질 오류·일시적인 서버 오류·연결 끊김은 사용자 개입 없이 한 번만
// 다시 시도합니다. 총 대기는 제한해 상담 화면이 오래 멈추지 않게 합니다.
// 앞 요청이 서버에서 아직 답변 중이면(COACH_BUSY) 같은 requestId로 기다렸다가
// 저장된 답변을 받아옵니다. 이미 차감된 답변을 놓치지 않기 위해서입니다.
export async function requestCoachWithRetry(payload, request = requestCoach, {budgetMs = 45_000, pauseMs = 400, busyPauseMs = 2_000} = {}) {
  const deadline = Date.now() + budgetMs;
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining < 1_000) break;
    try {
      const result = await request(payload, Math.min(25_000, remaining));
      if (result.response.ok && result.body?.text) return result;
      lastError = result;
      if (attempt > 0 && result.body?.code === 'COACH_BUSY' && deadline - Date.now() > busyPauseMs + 1_000) {
        await new Promise(resolve => setTimeout(resolve, busyPauseMs));
        attempt--;
        continue;
      }
      if (!result.response.ok && ![429, 500, 502, 503, 504].includes(result.response.status)) break;
    } catch (error) {
      lastError = error;
    }
    if (attempt === 0 && pauseMs && deadline - Date.now() > pauseMs + 1_000)
      await new Promise(resolve => setTimeout(resolve, pauseMs));
  }
  if (!lastError) { const error = new Error('AI 응답 시간이 초과됐습니다.'); error.name = 'AbortError'; throw error; }
  if (lastError instanceof Error) throw lastError;
  return lastError;
}
export const epicStatus = () => apiRequest('/api/epic');
export const requestEpic = (payload) => apiRequest('/api/epic', {
  method: 'POST', body: JSON.stringify(payload), timeout: 65_000
});
