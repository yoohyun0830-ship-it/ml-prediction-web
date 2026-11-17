import axios from 'axios';
import { consumeSse } from './sse.mjs';

// Both catalog and inference go through Spring; React never calls Python directly.
export const api = axios.create({ baseURL: '/api', timeout: 15000 });

export async function predictStream(input, onEvent, signal) {
  const response = await api.post('/predictions/stream', input, {
    adapter: 'fetch',
    responseType: 'stream',
    headers: { Accept: 'text/event-stream' },
    signal,
    timeout: 0, // The caller owns a timer covering both headers and the entire response body.
  });
  if (!response.headers['content-type']?.includes('text/event-stream')) {
    await response.data?.cancel?.();
    throw new Error('SSE 응답이 아닙니다. Java 서버의 API 주소를 확인해 주세요.');
  }
  await consumeSse(response.data, onEvent);
}
