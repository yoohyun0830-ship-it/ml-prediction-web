# Python 담당: CARFIT AI 예측 서버

제공된 `car details v4.csv`로 중고차 **가격 회귀** 모델을 학습하고, Spring Boot에 JSON/SSE로 결과를 제공합니다. 학습 데이터와 저장 모델의 가격 단위는 **인도 루피(INR)** 이며, API는 **원화(KRW)** 로 환산해서 반환합니다. 한국 중고차 시장 가격을 학습한 모델은 아닙니다.

### 원화 환산

`exchange_rate.json`에 저장한 2026-11-17 기준 참고 환율 **1 INR = 14.22 KRW**를 사용합니다. [Wise 참고 페이지](https://wise.com/us/currency-converter/inr-to-krw-rate/history/17-11-2026)의 표시값을 고정한 것으로, 실시간 환율 조회는 하지 않습니다. 환율을 변경하려면 해당 JSON의 `rate`, `as_of`, `source`를 함께 수정한 뒤 서버를 재시작하세요. 재학습은 필요 없습니다.

- `predictedPrice`, 추천의 `predicted_price`/`dataset_price`, `budget_used`: **원 단위 정수**.
- `predictedPriceInr`, 추천의 `predicted_price_inr`/`dataset_price_inr`: 확인용 원본 루피 가격.
- `metrics.mae`, `metrics.rmse`, `metrics.cv_mae`: 원화 환산 오차. 원본은 각각 `_inr` 필드에 보관합니다. R²는 바뀌지 않습니다.
- `exchange_rate`: 환율·기준일·출처·고정 환율 사용 여부를 응답에 포함합니다.
- `budget`의 기본 단위는 **원**입니다. 기존 루피 예산을 그대로 사용하려면 `"budget_currency": "INR"`를 명시하세요.
- `metrics.pkl`과 `metrics.json` 등 학습 산출물은 원본 INR 단위로 유지됩니다.

## 파일 역할

| 파일 | 역할 |
|---|---|
| `features.py` | 공통 피처, 데이터 정리, 전처리 + LightGBM 파이프라인 |
| `train.py` | Optuna TPE 최적화, 3겹 교차 검증, 최종 학습, 평가, joblib 저장 |
| `app.py` | 시작 시 모델 로드, 입력 검증, 예측, 차량 추천, SSE |
| `currency.py`, `exchange_rate.json` | 원화 환산 및 참고 환율 메타데이터 |
| `predict.py` | 기존 `uvicorn predict:app` 명령과 호환되는 진입점 |
| `test_api.py` | 실제 모델 예측, SSE, 입력 검증, 재학습/중복 로드 방지 테스트 |
| `requirements.lock.txt` | 실행 검증 환경의 전체 패키지 버전 |

## 실행 순서 (PowerShell, 프로젝트 최상위 폴더)

Python 3.12 가상환경이 이 작업에서 생성되었습니다. 새 PC에서는 Python 3.12를 설치한 후 `py -3.12 -m venv Python/.venv`로 생성합니다. 가상환경 활성화 없이 직접 실행하므로 PowerShell 실행 정책 변경이 필요 없습니다.

```powershell
# 새 PC에서 패키지 설치 (현재 PC는 설치 완료)
Python/.venv/Scripts/python.exe -m ensurepip
Python/.venv/Scripts/python.exe -m pip install -r Python/requirements.lock.txt

# 오프라인 학습: 최초 1회 또는 데이터 변경 시에만 실행
Python/.venv/Scripts/python.exe Python/train.py --csv 'C:/Users/yoohy/OneDrive/허유현/카카오톡 받은 파일/car details v4.csv' --trials 20

# AI 서버: 학습 완료 후 실행
Python/.venv/Scripts/python.exe -m uvicorn predict:app --app-dir Python --host 127.0.0.1 --port 8000

# 자동 테스트
Python/.venv/Scripts/python.exe -m pytest Python/test_api.py -q
```

API 문서: http://127.0.0.1:8000/docs

학습 산출물은 `Python/artifacts/`에 생성됩니다. CSV와 산출물은 Git에서 제외했습니다. 팀원에게 Python 서버 실행까지 맡길 경우 CSV와 `artifacts/car_model.pkl`을 별도로 전달하세요. Spring만 실행할 팀원에게는 AI 서버 주소와 아래 API 규격만 전달하면 됩니다. 같은 컴퓨터에서는 `http://127.0.0.1:8000`, 서로 다른 컴퓨터에서는 Python 서버를 `--host 0.0.0.0`으로 실행하고 Python 담당 PC의 LAN IP를 사용합니다.

## 모델링 설계와 평가

1. 원본 행 수를 확인하고 필수 열 누락, 비정상 숫자, 결측 필수 피처를 정리합니다.
2. 입력 피처 + 가격이 동일한 행을 제거한 뒤, 유효 고유 행이 최소 2,000행인지 검증합니다.
3. 타겟은 `Price`, 피처는 `Make`, `Model`, `Year`, `Kilometer`, `Fuel Type`, `Transmission`, `Owner`입니다. CSV에 사고 이력이 없으므로 입력으로 받지 않습니다.
4. 고정 seed=42로 학습 80% / 테스트 20%를 분리합니다.
5. 학습 80% 내부에서만 Optuna TPE와 3겹 교차 검증으로 MAE를 최소화합니다. 탐색 대상: 트리 수, 학습률, 잎 수, 최소 잎 샘플 수, L2 규제, 열 샘플링 비율.
6. 각 fold 안에서 결측치 대체와 One-hot encoding을 학습합니다. 미등록 범주는 인코더에서 무시하지만, API는 존재하지 않는 제조사/모델을 거절합니다.
7. `Pipeline(preprocessing → TransformedTargetRegressor(LGBMRegressor))`로 가격을 log1p 변환해 학습하고 expm1로 원래 INR 단위를 복원합니다.
8. `study.best_params`로 학습 80% 전체를 학습하고, 튜닝에 사용하지 않은 테스트 20%에서 R²·MAE·RMSE를 계산합니다. 평가한 모델 그대로 저장하며 테스트셋으로 재학습하지 않습니다.
9. `car_model.pkl`에는 최종 파이프라인, 지표, 추천용 CSV 차량과 미리 계산한 모델 가격을 저장합니다. 지표는 별도 `metrics.pkl`, `metrics.json`에도 저장합니다.

R²는 정확도 퍼센트가 아닙니다. 저장된 학습 지표의 MAE/RMSE 단위는 INR이며 API 응답에서는 원화로 환산합니다. 희귀 고가 차량이 있는 작은 단일 데이터셋의 무작위 분할 평가이며, 현재 시점 또는 한국 시장 성능을 의미하지 않습니다. 모델은 과거 데이터의 가격을 예측합니다.

## Java 담당자에게 전달할 API 규격

### 공통 요청 JSON

```json
{
  "make": "Honda",
  "model": "Amaze 1.2 VX i-VTEC",
  "year": 2017,
  "kilometer": 87150,
  "fuelType": "Petrol",
  "transmission": "Manual",
  "owner": "First",
  "budget": 10000000,
  "budget_currency": "KRW"
}
```

- 필수: `make`, `model`, `year`, `kilometer`, `fuelType`, `transmission`, `owner`.
- `budget`: 선택. 기본 단위는 원(KRW). 미입력 시 해당 차량의 예측 가격을 추천 예산으로 사용합니다.
- `budget_currency`: 선택. `KRW`(기본) 또는 `INR`. 예전 요청 `budget: 700000`을 루피로 해석하려면 `budget_currency: "INR"`를 함께 보내세요.
- `fuel`도 `fuelType`의 별칭으로 허용합니다. 둘 중 하나만 보내세요.
- 주행거리: 0~1,000,000km. 연식: 1980~실행 연도. 예산 숫자: 0 초과~10,000,000,000 (통화는 `budget_currency`로 지정).
- 등록된 제조사/모델 및 범주 값은 `GET /catalog`에서 가져옵니다.
- 잘못된 요청은 HTTP 422입니다. 유효성 검사는 SSE 응답 시작 전에 수행합니다.

| 경로 | 메서드 | 용도 |
|---|---|---|
| `/health` | GET | 모델 로드 상태 |
| `/catalog` | GET | CSV의 모델별 기본 입력, 연료/변속기/소유 이력 선택지, 지표 |
| `/predict` | POST | 일반 JSON 예측 |
| `/predict/stream` | POST | 동일 입력으로 SSE 진행 상태 + 최종 결과 |

### 일반 예측 결과 필드

| 필드 | 의미 |
|---|---|
| `predictedPrice` | 원화 환산 가격 (정수 원) |
| `predictedPriceInr` | 원본 루피 가격 예측 (정수 INR) |
| `r2` | 저장된 테스트셋 R² (이번 개별 예측의 신뢰도가 아님) |
| `currency` | `KRW` |
| `exchange_rate` | INR/KRW 환율, 기준일, 출처, 고정 환율 모드 |
| `metrics` | R²/MAE/RMSE, CV MAE, 행 수, 최적 파라미터, 학습 시각, CSV 해시 |
| `recommendations` | CSV 기반 추천 최대 5개 |
| `budget_used` | 추천에 적용한 원화 예산 |
| `outside_training_years` | 입력 연식이 학습 데이터의 연식 범위를 벗어나는지 여부 |

추천 항목: `make`, `model`, `year`, `kilometer`, `fuel`, `transmission`, `owner`, `predicted_price`, `dataset_price`, `predicted_price_inr`, `dataset_price_inr`, `currency`. 이름이 `_inr`로 끝나는 필드만 루피이며 나머지 가격은 원화입니다. 같은 연료·변속기이며 예측 가격이 예산 이하인 CSV 차량에서 연식·주행거리 차이가 작은 순서로 고릅니다. 모델별 한 항목만 노출합니다. 추천은 별도 학습 모델이 아닌 조건 기반 순위이며, **실시간 판매 매물이 아닙니다**. 예산 이하 보장은 모델 예측 가격 기준입니다.

### SSE 이벤트 순서

```text
event: progress
data: {"stage":"validated","message":"입력 조건 검증 완료"}

event: progress
data: {"stage":"predicting","message":"저장된 LightGBM 모델로 가격 추론 중"}

event: progress
data: {"stage":"recommending","message":"예산에 맞는 CSV 차량 비교 완료"}

event: result
data: <일반 예측 결과와 동일한 JSON>

event: done
data: {"message":"완료"}

```

실패 시 `event: error`와 `data: {"message":"..."}`를 보내고 종료합니다. 인위적 지연을 넣지 않으므로 상태 이벤트가 빠르게 연속 도착할 수 있습니다. SSE는 반드시 빈 줄 경계로 파싱해야 합니다. 네트워크 청크 하나가 이벤트 하나와 같지는 않습니다.

Spring은 WebClient로 `POST /predict/stream`, `Content-Type: application/json`, `Accept: text/event-stream`을 보내고 `Flux<ServerSentEvent<String>>`으로 받아 `event`와 `data`를 그대로 React로 중계하면 됩니다. `block()`을 사용하지 않습니다. 브라우저는 Spring만 호출하므로 FastAPI에 브라우저용 CORS를 설정하지 않았습니다.

## 발표 분담 예시

Python 담당: 데이터 2,000행 검증 → 누수 방지 분할 → Optuna CV → LightGBM 파이프라인 → joblib → FastAPI 로드/추론 → R²와 SSE 결과를 Swagger에서 시연.

Java 담당: WebClient 비동기 통신 → SSE 중계 → React axios 요청과 화면 상태 연동. 합동 설계에서는 위 JSON 규격과 이벤트 이름을 함께 확정합니다.

참고 문서: [LightGBM](https://lightgbm.readthedocs.io/en/stable/pythonapi/lightgbm.LGBMRegressor.html), [Optuna](https://optuna.readthedocs.io/en/stable/tutorial/10_key_features/001_first.html), [FastAPI StreamingResponse](https://fastapi.tiangolo.com/advanced/custom-response/), [Spring WebClient](https://docs.spring.io/spring-framework/reference/web/webflux-webclient/client-retrieve.html).
