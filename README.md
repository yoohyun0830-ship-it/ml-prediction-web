# CARFIT — 중고차 가격 예측 및 추천

React axios → Spring Boot WebClient → FastAPI LightGBM으로 연결된 로컬 실습 프로젝트입니다. Python 담당이 만든 학습 모델과 취합된 Java 게이트웨이를 연결했습니다.

## 실행: 터미널 3개

아래 명령은 모두 **프로젝트 최상위 폴더**에서 실행합니다. Python은 3.12 가상환경, Java는 JDK 17, React는 Node.js/npm이 필요합니다. `.venv` 활성화 없이 실행할 수 있습니다.

**1. Python AI 서버 (8000)**

```powershell
Python/.venv/Scripts/python.exe -m uvicorn predict:app --app-dir Python --host 127.0.0.1 --port 8000
```

현재 작업 환경에는 학습한 `Python/artifacts/car_model.pkl`이 있습니다. 새 PC에선 [Python 실행 안내](Python/README.md)에 따라 모델을 학습하거나 신뢰할 수 있는 팀 모델 산출물을 전달받으세요. 이미 8000에서 이 서버를 실행했다면 그대로 사용합니다. `Java/mock/mock_ai.py`는 가짜 서버이므로 함께 실행하지 않습니다.

**2. Spring Boot 게이트웨이 (8080)**

```powershell
Java/gradlew.bat -p Java --gradle-user-home .tools/gradle bootRun
```

최초 실행 시 Gradle과 의존성을 다운로드합니다. 프로젝트 안에 Gradle 캐시를 두므로 시스템의 `C:/.gradle` 접근 문제를 피합니다. Java 코드를 바꾼 경우 기존 Java 서버를 Ctrl+C로 종료하고 다시 실행합니다.

**3. React 화면 (5173)**

```powershell
# 최초 설치 또는 package-lock.json 변경 시
npm.cmd --prefix React ci

npm.cmd --prefix React run dev
```

브라우저: **http://127.0.0.1:5173/**

화면에서 제조사/모델을 고르고 조건·구매 예산을 입력한 뒤 ‘예상 가격 확인하기’를 누릅니다. 기본 Honda 예제로 시작하면 됩니다. 가격과 모델 평가를 확인한 뒤 ‘추천 차량 보기’를 누르면 같은 요청의 추천 5개를 볼 수 있습니다. 구매 예산 입력칸 단위는 **만 원**이며 요청 시 **원**으로 변환합니다. 예: `1000` 입력 → `budget: 10000000`.

## 연결 구조

```text
React :5173
  GET  /api/catalog ── Vite proxy ── Spring :8080 ── GET /catalog ── Python :8000
  POST /api/predictions/stream ── Spring WebClient ── POST /predict/stream
       ← progress / result / done 또는 error 이벤트 ←
```

- React는 Python을 직접 호출하지 않습니다. `vite.config.js`의 `/api` 프록시를 통해 Spring만 호출합니다.
- `src/api.mjs`: axios의 fetch 어댑터 + `responseType: 'stream'`으로 POST SSE를 수신합니다.
- `src/sse.mjs`: UTF-8을 복원하고 빈 줄로 이벤트를 나눕니다. 네트워크 청크와 이벤트의 경계가 달라도 동작합니다.
- React는 진행 상태, 로딩, 취소, 오류, 가격·R²·MAE·추천 차량을 표시합니다. 종료 이벤트가 없는 응답은 성공으로 표시하지 않습니다.
- Spring은 `Flux<ServerSentEvent<String>>`으로 이벤트 이름과 JSON 데이터를 보존해 중계합니다. 예산과 통화도 DTO로 전달합니다.
- 별도 추천용 `POST /api/recommendations`는 가격 예측과 동일한 입력 JSON을 받고, Python `/predict` 결과의 `recommendations` 배열을 반환합니다. 과거 팀원 mock의 `maxBudget/minSeats` 요청과 규격이 다릅니다. 좌석 수는 현재 모델 피처에 포함되지 않습니다.

## 검증

```powershell
# Python API 테스트
Python/.venv/Scripts/python.exe -m pytest Python/test_api.py -q

# SSE 경계·UTF-8·오류·중도 종료 테스트
node --test React/test/sse.test.mjs

# React 프로덕션 빌드
npm.cmd --prefix React run build

# Java 빌드
Java/gradlew.bat -p Java --gradle-user-home .tools/gradle bootJar

# 서버 3개를 켜둔 상태에서 실제 전체 경로 검증
node React/scripts/check-integration.mjs
```

마지막 검증은 Vite 프록시 → Spring → 실제 Python 모델 → axios SSE 파서 경로에서 차량 목록, 예측 결과, 예산 전달, 추천 배열, 잘못된 입력의 error 이벤트를 확인합니다. 브라우저 화면의 시각적 검증은 별도로 수행합니다.

## 포트와 오류

- `8000`: FastAPI. `/docs`는 API 테스트 화면입니다. 실제 웹은 `5173`입니다.
- `8080`: Spring. `/api/health`에서 Python 연결 상태를 확인합니다.
- `5173`: React. 포트가 사용 중이면 먼저 이전 React 서버를 종료하세요. 임의 포트 이동 대신 오류를 표시하도록 설정했습니다.
- 차량 목록 오류: Python과 Java가 모두 켜져 있는지 확인 후 화면의 다시 불러오기를 누릅니다.
- 포트 사용 중: 본인이 실행한 해당 서버 터미널에서 Ctrl+C 후 재실행합니다. 다른 프로세스를 확인 없이 종료하지 않습니다.
- SSE 오류: Java 로그와 Python 로그를 확인하세요. 예측은 45초 전체 제한이며 취소 후 재요청할 수 있습니다.

서로 다른 PC를 사용할 때는 Java 담당 PC에서 `$env:AI_SERVER_URL='http://Python-PC-IP:8000'`을 설정한 뒤 Java를 실행합니다. Python은 `--host 0.0.0.0`으로 실행합니다. React와 Java도 다른 PC라면 React 실행 터미널에 `$env:GATEWAY_URL='http://Java-PC-IP:8080'`을 지정합니다. 필요한 포트의 LAN 방화벽 접근도 확인하세요.

## 데이터와 가격 해석

인도 중고차 데이터 **2,059행 → 정제 후 2,053행**을 활용했습니다. 학습 모델은 INR 가격을 예측하며 API에서 고정 참고 환율로 KRW로 환산합니다. 한국 중고차 시세나 실시간 판매 매물이 아닙니다. R²는 정확도 퍼센트가 아니며 MAE는 테스트셋 전체의 평균 오차입니다. 추천의 예산 조건은 예측 가격 기준으로, CSV 기록 가격은 예산을 초과할 수 있습니다. 화면에서 두 가격을 함께 보여줍니다.

수업 방식으로 다시 학습한 모델의 무작위 분할 테스트 R²는 약 **0.374**입니다. 학습은 5겹 교차 검증과 Optuna R² 최대화, 조기 종료를 사용합니다. 발표 번호와 모델링 세부 사항은 [Python/README.md](Python/README.md)를 참고하세요.
