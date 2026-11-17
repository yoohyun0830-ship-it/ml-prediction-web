import React, { useEffect, useRef, useState } from 'react';
import { api, predictStream } from './api.mjs';
import './integration.css';

const money = value => Math.round(value).toLocaleString('ko-KR');
const won = value => `${money(value)}원`;
const labels = { Petrol: '가솔린', Diesel: '디젤', Electric: '전기', Hybrid: '하이브리드', Manual: '수동', Automatic: '자동', First: '1대 소유', Second: '2대 소유', Third: '3대 소유', Fourth: '4대 소유', '4 or More': '4대 이상 소유', 'UnRegistered Car': '미등록 차량' };
const display = value => labels[value] || value;
const carKey = car => `${car.make}/${car.model}`;

function Hero() {
  return <section className="hero"><div><div className="eyebrow"><span /> YOUR NEXT DRIVE, MADE SIMPLE</div><h1>내 차의 가치를 알고,<br />다음 차를 만나는 곳<span>.</span></h1><p>차량 조건으로 예상 가격을 확인하고<br />내 예산에 맞는 차량 모델을 찾아보세요.</p><div className="hero-tags"><span>↗ LightGBM 가격 예측</span><span>✓ 원화 예산으로 추천</span></div></div><div className="hero-art" aria-hidden="true"><div className="orbit" /><span className="art-label">FIND YOUR PERFECT FIT</span><svg viewBox="0 0 500 250"><ellipse cx="255" cy="208" rx="202" ry="19" fill="#123d32" opacity=".16" /><path d="M56 155 86 119 157 104 211 61 322 64 387 112 436 129 457 172 445 190 65 190 44 174Z" fill="#e2e9df" /><path d="m172 105 48-35 93 3 51 36Z" fill="#204d43" /><path d="m268 72 2 35M60 153h380" stroke="#9bafa2" strokeWidth="5" /><path d="m53 160 50 3-10 13H51m354-29 32 4 7 16-43-5" fill="#fcf6d5" />{[130, 373].map(x => <g key={x}><circle cx={x} cy="184" r="35" fill="#203a33" /><circle cx={x} cy="184" r="22" fill="#aebfb2" /><circle cx={x} cy="184" r="11" fill="#496357" /></g>)}</svg><div className="art-note">✦ 좋은 선택의 시작, CARFIT</div></div></section>;
}

export default function App() {
  const [catalog, setCatalog] = useState(null);
  const [reload, setReload] = useState(0);
  const [catalogError, setCatalogError] = useState('');
  const [form, setForm] = useState(null);
  const [budgetMan, setBudgetMan] = useState('1000');
  const [tab, setTab] = useState('predict');
  const [result, setResult] = useState(null);
  const [submitted, setSubmitted] = useState(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState([]);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState([]);
  const [onlySaved, setOnlySaved] = useState(false);
  const activeRequest = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    setCatalogError('');
    api.get('/catalog', { signal: controller.signal }).then(({ data }) => {
      if (!data.models?.length || data.currency !== 'KRW') throw new Error('차량 목록 응답이 올바르지 않습니다.');
      setCatalog(data);
      const initial = data.models.find(car => car.make === 'Honda' && car.model === 'Amaze 1.2 VX i-VTEC') || data.models[0];
      setForm({ ...initial, fuelType: initial.fuel });
    }).catch(error => {
      if (!controller.signal.aborted) setCatalogError(`차량 목록을 불러오지 못했습니다. Java(8080)와 Python(8000) 서버를 확인한 뒤 다시 시도해 주세요. ${error.response?.status ? `(HTTP ${error.response.status})` : ''}`);
    });
    return () => controller.abort();
  }, [reload]);

  useEffect(() => () => activeRequest.current?.abort(), []);

  const update = (name, value) => setForm(previous => ({ ...previous, [name]: value }));
  const selectProfile = profile => setForm({ ...profile, fuelType: profile.fuel });
  const changeTab = value => { setTab(value); setOnlySaved(false); };
  async function submit(event) {
    event.preventDefault();
    if (busy || !form) return;
    const input = {
      make: form.make, model: form.model, year: Number(form.year), kilometer: Number(form.kilometer),
      fuelType: form.fuelType, transmission: form.transmission, owner: form.owner,
      budget: Number(budgetMan) * 10000, budget_currency: 'KRW',
    };
    if (!Number.isFinite(input.budget) || input.budget <= 0) { setError('구매 예산을 입력해 주세요.'); return; }
    const controller = new AbortController();
    activeRequest.current = controller;
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 45000);
    setBusy(true); setError(''); setProgress([]); setResult(null); setOnlySaved(false);
    let completedResult;
    try {
      await predictStream(input, message => {
        if (message.event === 'progress') setProgress(previous => [...previous, message.data.message]);
        if (message.event === 'result') completedResult = message.data;
      }, controller.signal);
      setSubmitted(input);
      setResult(completedResult);
      setProgress(previous => [...previous, '예측 및 추천 완료']);
    } catch (error) {
      setError(controller.signal.aborted
        ? timedOut ? '요청 시간이 초과되었습니다. 서버 상태를 확인한 뒤 다시 시도해 주세요.' : '예측 요청을 취소했습니다.'
        : error.message || '예측 요청이 실패했습니다.');
    } finally {
      clearTimeout(timer); setBusy(false); activeRequest.current = null;
    }
  }

  const recommendations = (result?.recommendations || []).filter(car => !onlySaved || saved.includes(carKey(car)));
  const makes = [...new Set(catalog?.models.map(car => car.make) || [])];
  const models = catalog?.models.filter(car => car.make === form?.make) || [];
  return <div className="app">
    <header><a className="logo" href="./">CAR<span>FIT</span><i>↗</i></a><nav aria-label="주요 메뉴"><button className={tab === 'predict' ? 'active' : ''} onClick={() => changeTab('predict')}>내 차 가격 예측</button><button className={tab === 'recommend' ? 'active' : ''} onClick={() => changeTab('recommend')}>맞춤 차량 추천</button></nav><button className="saved" onClick={() => { setTab('recommend'); setOnlySaved(previous => !previous); }}>♡ 관심 차량 <b>{saved.length}</b></button></header>
    <main><Hero /><div className="workspace">
      <section className="panel"><div className="section-head"><div><span className="step">01 / DISCOVER</span><h2>내 차, 얼마일까요?</h2></div><span className="badge">LightGBM</span></div>
        <div className="tabs"><button className={tab === 'predict' ? 'selected' : ''} onClick={() => changeTab('predict')}>가격 예측</button><button className={tab === 'recommend' ? 'selected' : ''} onClick={() => changeTab('recommend')}>차량 추천</button></div>
        {catalogError ? <div className="connection-error" role="alert"><p>{catalogError}</p><button className="text-button" onClick={() => setReload(value => value + 1)}>목록 다시 불러오기 →</button></div> : !form ? <p role="status">학습 데이터의 차량 목록을 불러오는 중입니다…</p> : <form onSubmit={submit}>
          <fieldset className="input-fields" disabled={busy}><div className="fields">
            <label>제조사<select value={form.make} onChange={e => selectProfile(catalog.models.find(car => car.make === e.target.value))}>{makes.map(make => <option key={make}>{make}</option>)}</select></label>
            <label>모델<select value={form.model} onChange={e => selectProfile(models.find(car => car.model === e.target.value))}>{models.map(car => <option key={car.model}>{car.model}</option>)}</select></label>
            <label>연식<input className="form-input" type="number" min="1980" max={new Date().getFullYear()} required value={form.year} onChange={e => update('year', e.target.value)} /></label>
            <label>주행거리<div className="input-unit"><input type="number" min="0" max="1000000" required value={form.kilometer} onChange={e => update('kilometer', e.target.value)} /><span>km</span></div></label>
            <label>연료<select value={form.fuelType} onChange={e => update('fuelType', e.target.value)}>{catalog.fuels.map(value => <option key={value} value={value}>{display(value)}</option>)}</select></label>
            <label>변속기<select value={form.transmission} onChange={e => update('transmission', e.target.value)}>{catalog.transmissions.map(value => <option key={value} value={value}>{display(value)}</option>)}</select></label>
            <label>소유 이력<select value={form.owner} onChange={e => update('owner', e.target.value)}>{catalog.owners.map(value => <option key={value} value={value}>{display(value)}</option>)}</select></label>
            <label>구매 예산<div className="input-unit"><input type="number" min="1" max="1000000" required value={budgetMan} onChange={e => setBudgetMan(e.target.value)} /><span>만 원</span></div></label>
          </div></fieldset>
          <button className="primary" type="submit" disabled={busy}>{busy ? '예측 결과를 기다리는 중…' : tab === 'recommend' ? '예산에 맞는 차량 추천받기' : '예상 가격 확인하기'}<span>↗</span></button>
          <p className="fine">모델을 선택하면 CSV의 기본 조건이 입력됩니다. 변경 후 다시 예측할 수 있어요.</p>
        </form>}
        {busy && <button className="text-button" onClick={() => activeRequest.current?.abort()}>요청 취소</button>}
        {error && <p className="error-message" role="alert">{error}</p>}
        <ol className="progress-log" aria-label="예측 진행 상태" aria-live="polite">{progress.map((message, index) => <li key={`${index}-${message}`}><span>✓</span> {message}</li>)}</ol>
      </section>
      <section className="results" aria-busy={busy}><div className="section-head"><div><span className="step">02 / YOUR MATCH</span><h2>{tab === 'predict' ? '예상 가격 리포트' : onlySaved ? '추천 중 관심 차량' : '예산에 맞는 추천 차량'}</h2></div><span className="small-label">{tab === 'predict' ? '학습 모델 실시간 추론' : `${recommendations.length}개 모델`}</span></div>
        {!result ? <div className="empty" role="status"><div className="empty-icon">↗</div><h3>{busy ? '차량 조건을 분석하고 있어요' : '내 차의 가능성을 확인해 보세요'}</h3><p>{busy ? '진행 상태와 최종 결과가 실시간으로 전달됩니다.' : '차량 정보와 예산을 입력하면 예상 가격과 추천을 알려드려요.'}</p><div className="empty-line" /><span>YOUR CAR. YOUR NEXT CHAPTER.</span></div> : tab === 'predict' ? <div className="report" aria-live="polite">
          <span className="badge">예측 완료 · KRW</span><h3>{submitted.make} {submitted.model}</h3><p>{submitted.year}년 · {money(submitted.kilometer)}km · {display(submitted.fuelType)} · {display(submitted.transmission)}</p><div className="price">{money(result.predictedPrice)}<span>원</span></div>
          <div className="metric-grid"><div><span>테스트 R²</span><b>{result.r2.toFixed(3)}</b></div><div><span>평균 절대 오차</span><b>{won(result.metrics.mae)}</b></div><div><span>테스트 데이터</span><b>{money(result.metrics.test_rows)}건</b></div></div>
          <p className="report-note">R²와 평균 절대 오차는 테스트셋 전체의 평가 지표입니다. 이번 차량의 정확도 또는 오차 범위를 뜻하지 않습니다.</p>
          {result.outside_training_years && <p className="error-message">입력 연식이 학습 데이터 범위를 벗어나 예측 오차가 커질 수 있습니다.</p>}
          <div className="range">추천 예산 <b>{won(result.budget_used)}</b></div><button className="text-button" onClick={() => changeTab('recommend')}>이 예산으로 추천된 차량 {result.recommendations.length}개 보기 →</button>
          <p className="fine">{result.exchange_rate.as_of} 참고 환율 · 1 INR = {result.exchange_rate.rate}원 · 고정 환율</p>
        </div> : <><p className="recommend-caption">예산 {won(result.budget_used)} · {display(submitted.fuelType)} · {display(submitted.transmission)}<br />연식과 주행거리가 비슷한 CSV 차량을 추천합니다.</p><button className="text-button" onClick={() => setOnlySaved(value => !value)}>{onlySaved ? '전체 추천 보기' : '관심 차량만 보기'}</button><div className="car-list">{recommendations.length ? recommendations.map(car => <article className="car-card" key={carKey(car)}><div className="car-emoji" aria-hidden="true">🚘</div><div><span className="small-label">{car.make} · {car.year}년 · {money(car.kilometer)}km</span><h3>{car.model}</h3><p>{display(car.fuel)} · {display(car.transmission)} · {display(car.owner)}</p><b>{won(car.predicted_price)}</b><p>CSV 기록 가격 {won(car.dataset_price)}{car.dataset_price > result.budget_used ? ' · 예산 초과' : ''}</p></div><button className="heart" aria-label={`${car.model} 관심 차량 ${saved.includes(carKey(car)) ? '해제' : '등록'}`} aria-pressed={saved.includes(carKey(car))} onClick={() => setSaved(previous => previous.includes(carKey(car)) ? previous.filter(key => key !== carKey(car)) : [...previous, carKey(car)])}>{saved.includes(carKey(car)) ? '♥' : '♡'}</button></article>) : <div className="empty"><h3>조건에 맞는 차량이 없어요</h3><p>예산·연료·변속기를 변경해서 다시 요청하거나 관심 차량 필터를 해제하세요.</p></div>}</div></>}
      </section>
    </div><aside className="notice"><span>ⓘ</span><p><b>이용 전 확인해 주세요</b>인도 중고차 데이터로 학습한 가격을 원화로 환산합니다. 한국 시세나 실시간 판매 매물이 아닙니다. 추천의 예산 조건은 모델 예측 가격 기준이며 CSV 기록 가격은 예산을 초과할 수 있습니다.</p></aside></main>
    <footer><a className="logo" href="./">CAR<span>FIT</span></a><span>당신의 다음 여정을 위한, 더 나은 선택.</span><small>© {new Date().getFullYear()} CARFIT</small></footer>
  </div>;
}
