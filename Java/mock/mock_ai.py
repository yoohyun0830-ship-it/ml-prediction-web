# FastAPI 완성 전, Spring Boot 혼자 테스트하기 위한 "가짜 AI 서버"
# 실행 : python mock_ai.py   (필요 패키지 : pip install fastapi uvicorn)
import asyncio
import json

import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse

app = FastAPI()


def sse(event: str, data: dict) -> str:
    # SSE 이벤트 1개 = "event: 이름\ndata: {JSON}\n\n"  (한글 유지를 위해 ensure_ascii=False)
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


# 1. 가격 예측 (SSE) : progress 3개를 1초 간격으로 보낸 뒤 result 1개
@app.post("/predict/stream")
async def predict_stream(request: Request):
    body = await request.json()
    print("[mock] 예측 요청 :", body)

    async def event_generator():
        for msg in ["입력값 확인 중", "시세 예측 중", "비슷한 매물 검색 중"]:
            yield sse("progress", {"type": "progress", "message": msg})
            await asyncio.sleep(1)
        yield sse("result", {"type": "result", "predicted_price": 512000, "r2": 0.9})

    return StreamingResponse(event_generator(), media_type="text/event-stream")


# 2. 차량 추천 (JSON) : 가짜 후보 2개 배열
@app.post("/recommend")
async def recommend(request: Request):
    body = await request.json()
    print("[mock] 추천 요청 :", body)
    return [
        {"make": "Honda", "model": "Amaze 1.2 VX i-VTEC", "year": 2017,
         "kilometer": 87150, "seats": 5, "transmission": "Manual", "price": 505000},
        {"make": "Maruti Suzuki", "model": "Swift Dzire VDI", "year": 2016,
         "kilometer": 64000, "seats": 5, "transmission": "Manual", "price": 480000},
    ]


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)
