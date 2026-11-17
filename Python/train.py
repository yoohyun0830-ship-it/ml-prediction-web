"""Day18 s-12.py 순서: 분할 → Optuna → 최종 학습 → 평가 → 저장."""
import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import optuna
import pandas as pd
from lightgbm import early_stopping
from sklearn.metrics import r2_score, mean_absolute_error, mean_squared_error
from sklearn.model_selection import KFold, train_test_split
from features import ARTIFACTS, FEATURES, SEED, make_pipeline, read_data


def train(csv_path, trials=20):
    df = read_data(csv_path)
    raw_rows = len(pd.read_csv(csv_path))
    if raw_rows < 2000 or len(df) < 2000:
        raise ValueError(f'At least 2000 valid unique rows required: raw={raw_rows}, usable={len(df)}')

    # [4] 특성 X와 정답 Y를 정하고 학습용 80%, 테스트용 20%로 나눕니다.
    X = df[FEATURES]
    Y = df['Price']
    X_train, X_test, Y_train, Y_test = train_test_split(
        X, Y, test_size=0.2, random_state=SEED)

    # [5] 목적함수: 후보 파라미터를 5겹 교차 검증으로 평가합니다.
    def objective(trial):
        params = {
            'learning_rate': trial.suggest_float('learning_rate', 0.01, 0.1),
            'num_leaves': trial.suggest_int('num_leaves', 10, 30),
            'max_depth': trial.suggest_int('max_depth', 3, 10),
            'min_child_samples': trial.suggest_int('min_child_samples', 10, 50),
            'subsample': trial.suggest_float('subsample', 0.6, 1.0),
            'colsample_bytree': trial.suggest_float('colsample_bytree', 0.6, 1.0),
        }
        cv = KFold(n_splits=5, shuffle=True, random_state=SEED)
        cv_r2_scores = []
        cv_mae_scores = []
        best_iterations = []

        for train_idx, val_idx in cv.split(X_train, Y_train):
            X_tr, X_val = X_train.iloc[train_idx], X_train.iloc[val_idx]
            Y_tr, Y_val = Y_train.iloc[train_idx], Y_train.iloc[val_idx]
            pipe = make_pipeline({**params, 'n_estimators': 1000, 'subsample_freq': 1})
            pp = pipe.named_steps['preprocessing']
            model = pipe.named_steps['regression']

            # 전처리는 각 폴드의 학습 자료에서만 학습합니다.
            X_tr_encoded = pp.fit_transform(X_tr)
            X_val_encoded = pp.transform(X_val)
            model.fit(X_tr_encoded, Y_tr, eval_set=[(X_val_encoded, Y_val)],
                      callbacks=[early_stopping(stopping_rounds=50, verbose=False)])
            Y_pred = model.predict(X_val_encoded)
            cv_r2_scores.append(r2_score(Y_val, Y_pred))
            cv_mae_scores.append(mean_absolute_error(Y_val, Y_pred))
            best_iterations.append(model.best_iteration_)

        trial.set_user_attr('best_n_estimators', int(np.mean(best_iterations)))
        trial.set_user_attr('cv_mae', float(np.mean(cv_mae_scores)))
        return float(np.mean(cv_r2_scores))

    # [6] 수업처럼 TPE로 20회 탐색하여 평균 R²가 가장 큰 조합을 찾습니다.
    optuna.logging.set_verbosity(optuna.logging.WARNING)
    sampler = optuna.samplers.TPESampler(seed=SEED)
    study = optuna.create_study(direction='maximize', sampler=sampler)
    study.optimize(objective, n_trials=trials)
    optimal_trees = study.best_trial.user_attrs['best_n_estimators']
    print('최적 파라미터:', study.best_params)
    print('최적 트리 수:', optimal_trees)

    # [7] 최적 설정으로 학습용 전체를 학습합니다. 테스트 자료는 사용하지 않습니다.
    final_params = {**study.best_params, 'n_estimators': optimal_trees, 'subsample_freq': 1}
    final_model = make_pipeline(final_params)
    final_model.fit(X_train, Y_train)

    # [8] 남겨 둔 테스트 자료로 R²와 가격 오차를 확인합니다. 가격 단위는 INR입니다.
    Y_pred = np.maximum(0, final_model.predict(X_test))
    metrics = {
        'r2': float(r2_score(Y_test, Y_pred)),
        'mae': float(mean_absolute_error(Y_test, Y_pred)),
        'rmse': float(np.sqrt(mean_squared_error(Y_test, Y_pred))),
        'cv_r2': study.best_value,
        'cv_mae': study.best_trial.user_attrs['cv_mae'],
        'raw_rows': raw_rows, 'usable_rows': len(df),
        'train_rows': len(X_train), 'test_rows': len(X_test),
        'cv_folds': 5, 'trials': trials, 'seed': SEED,
        'currency': 'INR', 'features': FEATURES,
        'best_params': final_params,
        'trained_at': datetime.now(timezone.utc).isoformat(),
        'csv_sha256': hashlib.sha256(Path(csv_path).read_bytes()).hexdigest(),
        'evaluation': '20% untouched holdout; tuning uses 5-fold CV on training split only',
    }
    print('train r2:', final_model.score(X_train, Y_train))
    print('test r2:', metrics['r2'])

    # [9] joblib으로 저장합니다. 웹 서버는 이 파일을 불러와 예측합니다.
    # 웹 추천에 필요한 차량 목록과 예측 가격도 함께 저장합니다.
    catalogue = df[FEATURES + ['Price']].copy()
    catalogue['predicted_price'] = np.maximum(0, final_model.predict(X))
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    joblib.dump({'pipeline': final_model, 'metrics': metrics, 'catalogue': catalogue},
                ARTIFACTS / 'car_model.pkl')
    joblib.dump(metrics, ARTIFACTS / 'metrics.pkl')
    study.trials_dataframe().to_csv(ARTIFACTS / 'optuna_trials.csv', index=False)
    (ARTIFACTS / 'metrics.json').write_text(
        json.dumps(metrics, indent=2, ensure_ascii=False), encoding='utf-8')
    return metrics


if __name__ == '__main__':
    # CSV 경로와 탐색 횟수를 터미널에서 전달합니다.
    parser = argparse.ArgumentParser()
    parser.add_argument('--csv', type=Path, required=True)
    parser.add_argument('--trials', type=int, default=20)
    args = parser.parse_args()
    if args.trials < 1:
        parser.error('--trials must be positive')
    train(args.csv, args.trials)
