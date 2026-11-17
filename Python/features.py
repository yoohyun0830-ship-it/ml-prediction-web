"""Day15 전처리 + Day18 LightGBM 회귀 모델."""
from pathlib import Path

import pandas as pd
from lightgbm import LGBMRegressor
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

ROOT = Path(__file__).resolve().parent
ARTIFACTS = ROOT / 'artifacts'
SEED = 42

# [1] 입력 특성 7개: 문자형 5개, 수치형 2개. 정답은 Price입니다.
CATEGORICAL = ['Make', 'Model', 'Fuel Type', 'Transmission', 'Owner']
NUMERIC = ['Year', 'Kilometer']
FEATURES = CATEGORICAL + NUMERIC


def read_data(path: str | Path) -> pd.DataFrame:
    # [2] CSV를 읽고 결측값, 잘못된 값, 중복 행을 정리합니다.
    df = pd.read_csv(path)
    missing = set(FEATURES + ['Price']) - set(df.columns)
    if missing:
        raise ValueError(f'Missing CSV columns: {sorted(missing)}')
    for col in CATEGORICAL:
        df[col] = df[col].astype('string').str.strip().replace('', pd.NA)
    for col in NUMERIC + ['Price']:
        df[col] = pd.to_numeric(df[col], errors='coerce')
    df = df.dropna(subset=FEATURES + ['Price'])
    df = df[(df['Price'] > 0) & df['Year'].between(1980, 2030)
            & df['Kilometer'].between(0, 1000000)]
    return df.drop_duplicates(subset=FEATURES + ['Price']).reset_index(drop=True)


def make_pipeline(params=None):
    # [3] Day15 방식: 문자형은 원핫 인코딩, 수치형은 그대로 사용합니다.
    # 트리 모델은 스케일링이 필요하지 않습니다.
    pp = ColumnTransformer(transformers=[
        ('cat', OneHotEncoder(handle_unknown='ignore', sparse_output=False), CATEGORICAL),
        ('num', 'passthrough', NUMERIC),
    ])
    model = LGBMRegressor(random_state=SEED, verbose=-1, n_jobs=2, **(params or {}))
    return Pipeline([('preprocessing', pp), ('regression', model)])
