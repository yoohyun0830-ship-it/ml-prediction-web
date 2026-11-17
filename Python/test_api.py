import json
import math
import joblib
import pytest
from fastapi.testclient import TestClient
from app import app
from currency import INR_TO_KRW, to_krw

@pytest.fixture
def client():
    with TestClient(app) as api:
        yield api

def sample(client):
    item = client.get('/catalog').json()['models'][0]
    return {
        'make': item['make'], 'model': item['model'], 'year': item['year'],
        'kilometer': item['kilometer'], 'fuelType': item['fuel'],
        'transmission': item['transmission'], 'owner': item['owner'], 'budget': 10000000,
    }

def test_real_prediction_and_budget(client, monkeypatch):
    pipeline = app.state.bundle['pipeline']
    monkeypatch.setattr(pipeline, 'fit', lambda *args, **kwargs: pytest.fail('Inference must not retrain'))
    response = client.post('/predict', json=sample(client))
    assert response.status_code == 200
    result = response.json()
    assert result['predictedPrice'] > 0
    assert math.isfinite(result['r2'])
    assert result['r2'] == result['metrics']['r2']
    assert result['metrics']['usable_rows'] >= 2000
    assert result['currency'] == 'KRW'
    assert all(car['predicted_price'] <= 10000000 for car in result['recommendations'])
    assert len({(car['make'], car['model']) for car in result['recommendations']}) == len(result['recommendations'])

def test_sse_protocol(client):
    response = client.post('/predict/stream', json=sample(client))
    assert response.status_code == 200
    assert response.headers['content-type'].startswith('text/event-stream')
    events = []
    for frame in response.text.strip().split('\n\n'):
        lines = frame.splitlines()
        events.append((lines[0].removeprefix('event: '), json.loads(lines[1].removeprefix('data: '))))
    assert [name for name, _ in events] == ['progress', 'progress', 'progress', 'result', 'done']
    assert events[3][1]['predictedPrice'] > 0

@pytest.mark.parametrize('change', [
    {'kilometer': -1}, {'year': 1900}, {'budget': 0},
    {'model': 'not-a-real-model'}, {'fuelType': 'unknown'}, {'unexpected': True},
])
def test_bad_inputs(client, change):
    body = sample(client)
    body.update(change)
    assert client.post('/predict/stream', json=body).status_code == 422

def test_single_load_and_health(monkeypatch):
    original = joblib.load
    calls = []
    def counted(path):
        calls.append(path)
        return original(path)
    monkeypatch.setattr(joblib, 'load', counted)
    with TestClient(app) as client:
        assert client.get('/health').json()['model_loaded'] is True
        body = sample(client)
        client.post('/predict', json=body)
        client.post('/predict', json=body)
    assert len(calls) == 1

def test_conversion_and_original_metrics(client):
    body = sample(client)
    result = client.post('/predict', json=body).json()
    bundle = app.state.bundle
    from app import PredictionInput
    raw_price = float(bundle['pipeline'].predict(PredictionInput(**body).frame())[0])
    assert result['predictedPrice'] == to_krw(raw_price)
    assert result['predictedPriceInr'] == round(raw_price)
    assert result['metrics']['mae'] == pytest.approx(bundle['metrics']['mae'] * INR_TO_KRW)
    assert result['metrics']['mae_inr'] == bundle['metrics']['mae']
    assert result['metrics']['currency'] == 'KRW'
    assert bundle['metrics']['currency'] == 'INR'  # No mutation of the saved evaluation.
    assert result['r2'] == bundle['metrics']['r2']
    assert result['exchange_rate']['mode'] == 'fixed_reference'
    assert client.get('/catalog').json()['currency'] == 'KRW'

def test_inr_budget_compatibility(client):
    body = sample(client)
    body.update(budget=700000, budget_currency='INR')
    inr = client.post('/predict', json=body).json()
    body.update(budget=700000 * INR_TO_KRW, budget_currency='KRW')
    krw = client.post('/predict', json=body).json()
    assert inr['recommendations'] == krw['recommendations']
    assert inr['budget_used'] == krw['budget_used'] == to_krw(700000)
    assert all(item['predicted_price'] <= krw['budget_used'] for item in krw['recommendations'])

def test_invalid_budget_currency(client):
    body = sample(client)
    body['budget_currency'] = 'USD'
    assert client.post('/predict', json=body).status_code == 422
