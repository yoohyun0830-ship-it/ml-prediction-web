import test from 'node:test';
import assert from 'node:assert/strict';
import { createSseParser, consumeSse } from '../src/sse.mjs';

function fragmented(text, size = 1) {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream({ start(controller) {
    for (let i = 0; i < bytes.length; i += size) controller.enqueue(bytes.slice(i, i + size));
    controller.close();
  } });
}

test('split CRLF boundaries, comments and multiple events', () => {
  const received = [];
  const parser = createSseParser(event => received.push(event));
  const text = ': heartbeat\r\n\r\nevent: progress\r\ndata: {"message":"진행 중"}\r\n\r\nevent: done\ndata: {}\n\n';
  for (const char of text) parser.push(char);
  parser.finish();
  assert.deepEqual(received, [{ event: 'progress', data: { message: '진행 중' } }, { event: 'done', data: {} }]);
});

test('UTF-8 characters may be split across byte chunks', async () => {
  const received = [];
  await consumeSse(fragmented('event: progress\ndata: {"message":"예측 중 🚘"}\n\nevent: result\ndata: {"predictedPrice":7606674,"currency":"KRW"}\n\nevent: done\ndata: {}\n\n'), event => received.push(event));
  assert.equal(received[0].data.message, '예측 중 🚘');
  assert.equal(received[1].data.predictedPrice, 7606674);
});

test('upstream error event rejects instead of displaying success', async () => {
  await assert.rejects(consumeSse(fragmented('event: error\ndata: {"message":"AI 서버 연결 실패"}\n\n'), () => {}), /AI 서버 연결 실패/);
});

test('premature end without done is rejected', async () => {
  await assert.rejects(consumeSse(fragmented('event: result\ndata: {"predictedPrice":1,"currency":"KRW"}\n\n'), () => {}), /연결이 종료/);
});

test('truncated frame is rejected', async () => {
  await assert.rejects(consumeSse(fragmented('event: result\ndata: {"predictedPrice":'), () => {}), /중간에 종료/);
});

test('wrong currency or missing result is rejected', async () => {
  await assert.rejects(consumeSse(fragmented('event: result\ndata: {"predictedPrice":1,"currency":"INR"}\n\n'), () => {}), /통화/);
  await assert.rejects(consumeSse(fragmented('event: done\ndata: {}\n\n'), () => {}), /연결이 종료/);
});
