"""Shared training/inference schema. Price is never an input feature."""
from pathlib import Path
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer, TransformedTargetRegressor
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder
from lightgbm import LGBMRegressor

ROOT = Path(__file__).resolve().parent
ARTIFACTS = ROOT / 'artifacts'
CATEGORICAL = ['Make', 'Model', 'Fuel Type', 'Transmission', 'Owner']
NUMERIC = ['Year', 'Kilometer']
FEATURES = CATEGORICAL + NUMERIC
SEED = 42

def make_pipeline(params=None):
    preprocessor = ColumnTransformer([
        ('categories', Pipeline([
            ('missing', SimpleImputer(strategy='most_frequent')),
            ('encode', OneHotEncoder(handle_unknown='ignore', sparse_output=False)),
        ]), CATEGORICAL),
        ('numbers', SimpleImputer(strategy='median'), NUMERIC),
    ])
    regressor = LGBMRegressor(random_state=SEED, verbosity=-1, n_jobs=2, **(params or {}))
    return Pipeline([
        ('preprocessing', preprocessor),
        ('regression', TransformedTargetRegressor(regressor=regressor, func=np.log1p, inverse_func=np.expm1)),
    ])

def read_data(path):
    frame = pd.read_csv(path)
    missing = set(FEATURES + ['Price']) - set(frame.columns)
    if missing:
        raise ValueError(f'Missing CSV columns: {sorted(missing)}')
    for name in CATEGORICAL:
        frame[name] = frame[name].astype('string').str.strip().replace('', pd.NA)
    for name in NUMERIC + ['Price']:
        frame[name] = pd.to_numeric(frame[name], errors='coerce')
    frame = frame.dropna(subset=FEATURES + ['Price'])
    frame = frame[(frame.Price > 0) & frame.Year.between(1980, 2030) & frame.Kilometer.between(0, 1000000)]
    # Remove identical supervised examples before splitting to avoid duplicate leakage.
    return frame.drop_duplicates(subset=FEATURES + ['Price']).reset_index(drop=True)
