"""웹 표시용 환산입니다. 저장된 모델과 평가 지표의 단위는 INR입니다."""
import json
import math
from pathlib import Path

EXCHANGE_RATE = json.loads(Path(__file__).with_name('exchange_rate.json').read_text(encoding='utf-8'))
INR_TO_KRW = float(EXCHANGE_RATE['rate'])
if not math.isfinite(INR_TO_KRW) or INR_TO_KRW <= 0:
    raise ValueError('INR/KRW reference rate must be finite and positive')

def to_krw(amount):
    # [17] 웹 추가 기능: 루피 예측값에 고정 참고 환율을 곱해 원화로 표시합니다.
    return round(float(amount) * INR_TO_KRW)

def krw_metrics(original):
    result = dict(original)
    for name in ('mae', 'rmse', 'cv_mae'):
        result[f'{name}_inr'] = original[name]
        result[name] = float(original[name]) * INR_TO_KRW
    result['currency'] = 'KRW'
    result['training_currency'] = 'INR'
    return result
