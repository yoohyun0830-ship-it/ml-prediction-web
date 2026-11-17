"""Presentation conversion only; saved model and evaluation artifacts stay in INR."""
import json
import math
from pathlib import Path

EXCHANGE_RATE = json.loads(Path(__file__).with_name('exchange_rate.json').read_text(encoding='utf-8'))
INR_TO_KRW = float(EXCHANGE_RATE['rate'])
if not math.isfinite(INR_TO_KRW) or INR_TO_KRW <= 0:
    raise ValueError('INR/KRW reference rate must be finite and positive')

def to_krw(amount):
    return round(float(amount) * INR_TO_KRW)

def krw_metrics(original):
    result = dict(original)
    for name in ('mae', 'rmse', 'cv_mae'):
        result[f'{name}_inr'] = original[name]
        result[name] = float(original[name]) * INR_TO_KRW
    result['currency'] = 'KRW'
    result['training_currency'] = 'INR'
    return result
