import assert from 'node:assert/strict';
import { requestCoachWithRetry } from '../src/client/api/readings.js';

const reply = (status, text = '') => ({response:{status,ok:status>=200&&status<300},body:{text}});
const payload = {chart:{},messages:[]};

let calls = 0;
let result = await requestCoachWithRetry(payload, async () => ++calls === 1 ? reply(502) : reply(200,'완성된 답변'), {pauseMs:0});
assert.equal(calls,2);assert.equal(result.body.text,'완성된 답변');

calls = 0;
result = await requestCoachWithRetry(payload, async () => {if(++calls===1)throw new TypeError('network');return reply(200,'재연결 답변');}, {pauseMs:0});
assert.equal(calls,2);assert.equal(result.body.text,'재연결 답변');

calls = 0;
result = await requestCoachWithRetry(payload, async () => ++calls === 1 ? reply(429) : reply(200,'대기 후 답변'), {pauseMs:0});
assert.equal(calls,2);assert.equal(result.body.text,'대기 후 답변');

calls = 0;
result = await requestCoachWithRetry(payload, async () => ++calls === 1 ? reply(200) : reply(200,'본문 복구'), {pauseMs:0});
assert.equal(calls,2);assert.equal(result.body.text,'본문 복구');

calls = 0;
result = await requestCoachWithRetry(payload, async () => {calls++;return reply(400);}, {pauseMs:0});
assert.equal(calls,1);assert.equal(result.response.status,400,'영구적인 요청 오류는 재시도하지 않는다');

calls = 0;
result = await requestCoachWithRetry(payload, async () => {calls++;return reply(502);}, {pauseMs:0});
assert.equal(calls,2);assert.equal(result.response.status,502,'반복 실패도 두 번에서 멈춘다');

// 첫 요청이 클라이언트에서 시간 초과돼도 서버는 답변 중일 수 있어, 같은 요청을 기다렸다가 받아온다.
const busy = {response:{status:409,ok:false},body:{code:'COACH_BUSY'}};
calls = 0;
result = await requestCoachWithRetry(payload, async () => {calls++;if(calls===1)throw new TypeError('timeout');return calls<4?busy:reply(200,'저장된 답변');}, {pauseMs:0,busyPauseMs:0});
assert.equal(calls,4);assert.equal(result.body.text,'저장된 답변');

calls = 0;
result = await requestCoachWithRetry(payload, async () => {calls++;return busy;}, {pauseMs:0,busyPauseMs:0});
assert.equal(calls,1,'다른 기기의 답변이 진행 중이면 첫 응답에서 멈춘다');

console.log('PASS: coach retries transient and empty responses once, waits out its own in-flight answer, but not permanent errors.');
