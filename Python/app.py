import asyncio
import json
import logging
from contextlib import asynccontextmanager
from datetime import date
from typing import Literal
import joblib
import pandas as pd
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import AliasChoices, BaseModel, ConfigDict, Field
from starlette.concurrency import run_in_threadpool
from features import ARTIFACTS, FEATURES
from currency import EXCHANGE_RATE, INR_TO_KRW, krw_metrics, to_krw

logger = logging.getLogger(__name__)

class PredictionInput(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)
    make: str = Field(min_length=1, max_length=80)
    model: str = Field(min_length=1, max_length=150)
    year: int = Field(ge=1980, le=date.today().year)
    kilometer: int = Field(ge=0, le=1000000)
    fuel: str = Field(min_length=1, max_length=30, validation_alias=AliasChoices('fuelType', 'fuel'))
    transmission: str = Field(min_length=1, max_length=30)
    owner: str = Field(min_length=1, max_length=30)
    budget: float | None = Field(default=None, gt=0, le=10000000000, description='구매 예산. 기본 단위는 원(KRW)입니다.')
    budget_currency: Literal['KRW', 'INR'] = Field(default='KRW', description='budget의 통화. 기존 루피 예산을 사용할 때 INR로 지정합니다.')

    def frame(self):
        return pd.DataFrame([[self.make, self.model, self.fuel, self.transmission, self.owner, self.year, self.kilometer]], columns=FEATURES)

@asynccontextmanager
async def lifespan(app):
    path = ARTIFACTS / 'car_model.pkl'
    if not path.exists():
        raise RuntimeError('Model missing. Run train.py --csv <path> first.')
    # Local trusted artifact only. Loaded once, never trained inside requests.
    app.state.bundle = joblib.load(path)
    yield

app = FastAPI(title='CARFIT LightGBM API', lifespan=lifespan)

def validate_catalogue(payload, bundle):
    catalogue = bundle['catalogue']
    matching = catalogue[(catalogue.Make == payload.make) & (catalogue.Model == payload.model)]
    if matching.empty:
        raise HTTPException(422, 'Unknown make/model combination. Select an option from /catalog.')
    for column, value in [('Fuel Type', payload.fuel), ('Transmission', payload.transmission), ('Owner', payload.owner)]:
        if value not in set(catalogue[column]):
            raise HTTPException(422, f'Unknown {column}')

def infer(payload, bundle):
    predicted = max(0.0, float(bundle['pipeline'].predict(payload.frame())[0]))
    catalogue = bundle['catalogue']
    budget = predicted if payload.budget is None else (
        payload.budget / INR_TO_KRW if payload.budget_currency == 'KRW' else payload.budget
    )
    # These are historical dataset examples, not live listings. Match fuel/transmission
    # then rank by distance to requested year/mileage; one example per model.
    candidates = catalogue[(catalogue.predicted_price <= budget) & (catalogue['Fuel Type'] == payload.fuel) & (catalogue.Transmission == payload.transmission)].copy()
    candidates['distance'] = abs(candidates.Year - payload.year) / 5 + abs(candidates.Kilometer - payload.kilometer) / 50000
    candidates = candidates.sort_values(['distance', 'predicted_price']).drop_duplicates(['Make', 'Model']).head(5)
    recommendations = [{
        'make': row['Make'], 'model': row['Model'], 'year': int(row['Year']),
        'kilometer': int(row['Kilometer']), 'fuel': row['Fuel Type'],
        'transmission': row['Transmission'], 'owner': row['Owner'],
        'predicted_price': to_krw(row['predicted_price']), 'dataset_price': to_krw(row['Price']),
        'predicted_price_inr': round(float(row['predicted_price'])), 'dataset_price_inr': round(float(row['Price'])),
        'currency': 'KRW',
    } for _, row in candidates.iterrows()]
    return {
        'predictedPrice': to_krw(predicted), 'predictedPriceInr': round(predicted),
        'r2': bundle['metrics']['r2'], 'currency': 'KRW',
        'exchange_rate': dict(EXCHANGE_RATE),
        'metrics': krw_metrics(bundle['metrics']), 'recommendations': recommendations,
        'budget_used': to_krw(budget), 'budget_currency': 'KRW',
        'outside_training_years': not int(catalogue.Year.min()) <= payload.year <= int(catalogue.Year.max()),
    }

@app.get('/health')
def health(request: Request):
    return {'status': 'ok', 'model_loaded': True, 'trained_at': request.app.state.bundle['metrics']['trained_at']}

@app.get('/catalog')
def catalog(request: Request):
    bundle = request.app.state.bundle
    frame = bundle['catalogue']
    models = []
    for (make, model), group in frame.groupby(['Make', 'Model'], sort=True):
        row = group.iloc[0]
        models.append({'make': make, 'model': model, 'year': int(row.Year), 'kilometer': int(row.Kilometer), 'fuel': row['Fuel Type'], 'transmission': row.Transmission, 'owner': row.Owner})
    return {'models': models, 'fuels': sorted(frame['Fuel Type'].unique().tolist()), 'transmissions': sorted(frame.Transmission.unique().tolist()), 'owners': sorted(frame.Owner.unique().tolist()), 'year_min': int(frame.Year.min()), 'year_max': int(frame.Year.max()), 'metrics': krw_metrics(bundle['metrics']), 'currency': 'KRW', 'exchange_rate': dict(EXCHANGE_RATE)}

@app.post('/predict')
async def predict(payload: PredictionInput, request: Request):
    bundle = request.app.state.bundle
    validate_catalogue(payload, bundle)
    return await run_in_threadpool(infer, payload, bundle)

def event(name, data):
    return f'event: {name}\ndata: {json.dumps(data, ensure_ascii=False, allow_nan=False)}\n\n'

@app.post('/predict/stream')
async def predict_stream(payload: PredictionInput, request: Request):
    bundle = request.app.state.bundle
    validate_catalogue(payload, bundle)
    async def generate():
        yield event('progress', {'stage': 'validated', 'message': '입력 조건 검증 완료'})
        yield event('progress', {'stage': 'predicting', 'message': '저장된 LightGBM 모델로 가격 추론 중'})
        try:
            result = await run_in_threadpool(infer, payload, bundle)
            if await request.is_disconnected():
                return
            yield event('progress', {'stage': 'recommending', 'message': '예산에 맞는 CSV 차량 비교 완료'})
            yield event('result', result)
            yield event('done', {'message': '완료'})
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception('Prediction failed')
            yield event('error', {'message': '예측 처리 중 오류가 발생했습니다. 서버 로그를 확인해 주세요.'})
    return StreamingResponse(generate(), media_type='text/event-stream', headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'})
