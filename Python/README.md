# Python — 자동차 가격 예측

Day15의 전처리, Day18 `s-12.py`의 LightGBM·Optuna 학습, Day16의 FastAPI를 연결한 프로젝트입니다.

## 발표 순서

코드의 `[번호]` 주석을 따라 설명합니다.

바로 읽을 수 있는 발표 대본과 예상 질문은 [발표 스크립트](presentation-script.md)에 있습니다.

| 파일 | 번호 | 설명 |
|---|---|---|
| features.py | [1]~[3] | 특성 선택 → 데이터 정리 → 원핫 인코딩과 파이프라인 |
| train.py | [4]~[9] | 8:2 분할 → 5겹 교차 검증 → Optuna → 학습 → 평가 → 저장 |
| app.py | [10]~[16] | 입력 검사 → 모델 로드 → FastAPI → 예측 → 추천 → JSON·SSE 응답 |
| currency.py | [17] | 원화 환산 |

학습 부분은 수업처럼 LGBMRegressor, TPESampler(seed=42), 기본 20회 탐색을 사용합니다. 각 폴드에서 50회 동안 검증 성능이 개선되지 않으면 조기 종료합니다. 최적 조합의 폴드별 트리 수 평균으로 최종 모델을 학습합니다. 테스트 20%는 최종 평가에만 사용합니다.

수업 Day18의 category 타입 대신 Day15의 ColumnTransformer와 OneHotEncoder를 사용합니다. 범주형의 내장 처리는 단순한 원핫 인코딩과는 다른 방식입니다. 처음 보는 범주로 요청해도 인코더가 오류를 내지 않도록 handle_unknown='ignore'를 설정했습니다. API는 제조사·모델과 범주 값도 검사합니다.

로그 가격 변환과 SimpleImputer는 사용하지 않습니다. 결측 행은 학습 전에 제거하고, 가격을 원래 INR 단위로 직접 학습합니다. 트리 모델이므로 수치형 스케일링은 생략합니다.

추천, 환율 변환, SSE, 입력 검사는 웹 연결을 위한 추가 부분입니다. 모델과 평가 지표는 INR로 저장하며, API에서 고정 참고 환율로 KRW로 바꿉니다. R²는 정확도 퍼센트가 아닙니다.

## 실행

아래 명령은 프로젝트 최상위 폴더에서 실행합니다.

```powershell
# 데이터 또는 학습 코드 변경 시 학습합니다. CSV 경로를 실제 위치로 바꾸세요.
Python/.venv/Scripts/python.exe Python/train.py --csv 'C:/경로/car details v4.csv' --trials 20

# 학습 후 서버를 실행합니다. 이미 실행 중이면 Ctrl+C 후 다시 실행하세요.
Python/.venv/Scripts/python.exe -m uvicorn predict:app --app-dir Python --host 127.0.0.1 --port 8000

# API 테스트
Python/.venv/Scripts/python.exe -m pytest Python/test_api.py -q
```

서버는 요청마다 재학습하지 않고 시작할 때 `artifacts/car_model.pkl`을 한 번 불러옵니다. 이 파일에는 파이프라인, 평가 지표, 추천용 차량 목록이 들어 있습니다. 본인이 학습했거나 신뢰할 수 있는 모델 파일만 사용하세요.

새 환경에서는 Python 3.12로 가상환경을 만들고 의존성을 설치합니다.

```powershell
py -3.12 -m venv Python/.venv
Python/.venv/Scripts/python.exe -m pip install -r Python/requirements.lock.txt
```

API 확인: http://127.0.0.1:8000/docs
전체 웹 실행: 프로젝트 최상위 README.md 참고. React와 Java도 실행해야 합니다.

## 웹 API

- `GET /health`: 모델 로드 상태
- `GET /catalog`: 차량 선택 목록과 모델 평가
- `POST /predict`: JSON 예측·추천
- `POST /predict/stream`: progress → result → done SSE 응답

요청 예시입니다. budget은 원 단위이며, 생략하면 예측 가격을 추천 예산으로 사용합니다.

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

예측 가격과 추천 가격은 원화입니다. `_inr` 또는 `Inr`가 붙은 가격은 원본 루피 값입니다. `exchange_rate.json`의 rate, as_of, source가 환산 기준이며 실시간 조회는 하지 않습니다. 인도 데이터 기반 예측으로, 한국 시세나 실시간 매물이 아닙니다.
