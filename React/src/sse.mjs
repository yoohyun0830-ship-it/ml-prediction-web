// A network chunk may contain half an event, multiple events, or half a UTF-8 character.
export function createSseParser(onEvent) {
  let buffer = '';
  return {
    push(text) {
      buffer += text;
      let boundary;
      while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
        const frame = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary[0].length);
        let name = 'message';
        const data = [];
        for (const line of frame.split(/\r?\n/)) {
          if (line.startsWith('event:')) name = line.slice(6).trim();
          if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
        }
        if (data.length) onEvent({ event: name, data: JSON.parse(data.join('\n')) });
      }
    },
    finish() {
      if (buffer.trim()) throw new Error('SSE 응답이 중간에 종료되었습니다. 다시 시도해 주세요.');
    },
  };
}

export async function consumeSse(stream, onEvent) {
  if (!stream?.getReader) throw new Error('스트리밍 응답을 받지 못했습니다. 서버 연결을 확인해 주세요.');
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let hasResult = false;
  let done = false;
  const parser = createSseParser(message => {
    if (message.event === 'error') throw new Error(message.data.message || '예측 요청이 실패했습니다.');
    if (message.event === 'result') {
      if (message.data.currency !== 'KRW' || !Number.isFinite(message.data.predictedPrice)) {
        throw new Error('AI 응답의 가격 또는 통화 형식이 올바르지 않습니다.');
      }
      hasResult = true;
    }
    if (message.event === 'done') done = true;
    onEvent(message);
  });
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      parser.push(decoder.decode(chunk.value, { stream: true }));
    }
    parser.push(decoder.decode());
    parser.finish();
    if (!hasResult || !done) throw new Error('예측이 완료되기 전에 연결이 종료되었습니다. 다시 시도해 주세요.');
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
