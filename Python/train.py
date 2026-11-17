"""Offline only: Optuna TPE + 3-fold CV, untouched holdout, joblib persistence."""
import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
import joblib
import numpy as np
import optuna
import pandas as pd
from sklearn.metrics import r2_score, mean_absolute_error, mean_squared_error
from sklearn.model_selection import KFold, cross_val_score, train_test_split
from features import ARTIFACTS, FEATURES, SEED, make_pipeline, read_data

def train(csv_path, trials=20):
    raw_rows = len(pd.read_csv(csv_path))
    frame = read_data(csv_path)
    if raw_rows < 2000 or len(frame) < 2000:
        raise ValueError(f'At least 2000 valid unique rows required: raw={raw_rows}, usable={len(frame)}')
    X_train, X_test, y_train, y_test = train_test_split(frame[FEATURES], frame.Price, test_size=.2, random_state=SEED)
    cv = KFold(n_splits=3, shuffle=True, random_state=SEED)
    def objective(trial):
        params = {
            'n_estimators': trial.suggest_int('n_estimators', 150, 650, step=100),
            'learning_rate': trial.suggest_float('learning_rate', .02, .15, log=True),
            'num_leaves': trial.suggest_int('num_leaves', 12, 48),
            'min_child_samples': trial.suggest_int('min_child_samples', 5, 30),
            'reg_lambda': trial.suggest_float('reg_lambda', .001, 10, log=True),
            'colsample_bytree': trial.suggest_float('colsample_bytree', .7, 1),
        }
        # Preprocessing is refitted within every fold, only on its training rows.
        scores = cross_val_score(make_pipeline(params), X_train, y_train, cv=cv, scoring='neg_mean_absolute_error', n_jobs=1)
        return -float(scores.mean())
    study = optuna.create_study(direction='minimize', sampler=optuna.samplers.TPESampler(seed=SEED))
    study.optimize(objective, n_trials=trials)
    pipeline = make_pipeline(study.best_params)
    pipeline.fit(X_train, y_train)
    predictions = np.maximum(0, pipeline.predict(X_test))
    metrics = {
        'r2': float(r2_score(y_test, predictions)),
        'mae': float(mean_absolute_error(y_test, predictions)),
        'rmse': float(np.sqrt(mean_squared_error(y_test, predictions))),
        'cv_mae': study.best_value,
        'raw_rows': raw_rows, 'usable_rows': len(frame),
        'train_rows': len(X_train), 'test_rows': len(X_test),
        'cv_folds': 3, 'trials': trials, 'seed': SEED,
        'currency': 'INR', 'features': FEATURES,
        'best_params': study.best_params,
        'trained_at': datetime.now(timezone.utc).isoformat(),
        'csv_sha256': hashlib.sha256(Path(csv_path).read_bytes()).hexdigest(),
        'evaluation': '20% untouched holdout; tuning uses 3-fold CV on training split only',
    }
    # Keep the evaluated model unchanged: do not refit on the test set.
    catalogue = frame[FEATURES + ['Price']].copy()
    catalogue['predicted_price'] = np.maximum(0, pipeline.predict(catalogue[FEATURES]))
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    joblib.dump({'pipeline': pipeline, 'metrics': metrics, 'catalogue': catalogue}, ARTIFACTS / 'car_model.pkl')
    joblib.dump(metrics, ARTIFACTS / 'metrics.pkl')
    study.trials_dataframe().to_csv(ARTIFACTS / 'optuna_trials.csv', index=False)
    (ARTIFACTS / 'metrics.json').write_text(json.dumps(metrics, indent=2, ensure_ascii=False), encoding='utf-8')
    print(json.dumps(metrics, indent=2, ensure_ascii=False))
    return metrics

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--csv', type=Path, required=True)
    parser.add_argument('--trials', type=int, default=20)
    args = parser.parse_args()
    if args.trials < 1:
        parser.error('--trials must be positive')
    train(args.csv, args.trials)
