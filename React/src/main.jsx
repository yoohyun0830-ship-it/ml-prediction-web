import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

const cars = [
  { brand: '현대', model: '아반떼', type: '세단', price: 2400, fuel: '가솔린', icon: '🚘', desc: '부담 없는 유지비, 균형 잡힌 첫 차' },
  { brand: '기아', model: 'K5', type: '세단', price: 3100, fuel: '가솔린', icon: '🚙', desc: '여유로운 공간과 편안한 일상 주행' },
  { brand: '현대', model: '쏘나타', type: '세단', price: 3200, fuel: '가솔린', icon: '🚘', desc: '출퇴근부터 주말 여행까지 편안하게' },
  { brand: '기아', model: '셀토스', type: 'SUV', price: 2800, fuel: '가솔린', icon: '🚙', desc: '도심에서도 여행에서도 실용적인 SUV' },
  { brand: '현대', model: '투싼', type: 'SUV', price: 3500, fuel: '디젤', icon: '🚙', desc: '넉넉한 적재 공간을 갖춘 패밀리카' },
  { brand: '기아', model: '모닝', type: '경차', price: 1500, fuel: '가솔린', icon: '🚗', desc: '가볍게 시작하는 경제적인 드라이빙' },
  { brand: '현대', model: '아이오닉 5', type: '전기차', price: 5200, fuel: '전기', icon: '🚙', desc: '조용한 주행과 넓은 실내 공간' },
];
const money = value => Math.round(value).toLocaleString('ko-KR');
const yearNow = new Date().getFullYear();
function estimate(car, year, mileage, accident) {
  return Math.max(car.price * .12, car.price * Math.pow(.89, Math.max(0, yearNow - year)) * (1 - Math.min(mileage / 600000, .45)) * (accident === '있음' ? .85 : 1));
}
function App() {
  const [tab, setTab] = useState('predict');
  const [brand, setBrand] = useState('현대');
  const [model, setModel] = useState('아반떼');
  const [year, setYear] = useState('2021');
  const [mileage, setMileage] = useState('45000');
  const [accident, setAccident] = useState('없음');
  const [budget, setBudget] = useState(2000);
  const [type, setType] = useState('전체');
  const [result, setResult] = useState(null);
  const [saved, setSaved] = useState([]);
  const [onlySaved, setOnlySaved] = useState(false);
  const [error, setError] = useState('');
  const recommendations = cars.map(car => ({ ...car, estimated: estimate(car, yearNow - 4, 50000, '없음') })).filter(car => (type === '전체' || car.type === type) && car.estimated <= budget && (!onlySaved || saved.includes(car.model))).sort((a,b) => b.estimated - a.estimated);
  function predict(event) {
    event.preventDefault();
    if (!Number.isInteger(Number(year)) || year < 2000 || year > yearNow || mileage === '' || !Number.isFinite(Number(mileage)) || mileage < 0 || mileage > 1000000) { setError('연식과 주행거리를 확인해 주세요. 주행거리는 0~1,000,000km까지 입력할 수 있습니다.'); return; }
    const car = cars.find(item => item.model === model);
    setResult({ car, price: estimate(car, Number(year), Number(mileage), accident), year, mileage });
    setError('');
  }
  return <div className="app">
    <header><a className="logo" href="./">CAR<span>FIT</span><i>↗</i></a><nav aria-label="주요 메뉴"><button className={tab === 'predict' ? 'active' : ''} onClick={() => setTab('predict')}>내 차 가격 예측</button><button className={tab === 'recommend' ? 'active' : ''} onClick={() => { setTab('recommend'); setOnlySaved(false); }}>맞춤 차량 추천</button></nav><button className="saved" onClick={() => { setTab('recommend'); setOnlySaved(!onlySaved); }}>♡ 관심 차량 <b>{saved.length}</b></button></header>
    <main><section className="hero"><div><div className="eyebrow"><span/> YOUR NEXT DRIVE, MADE SIMPLE</div><h1>내 차의 가치를 알고,<br/>다음 차를 만나는 곳<span>.</span></h1><p>복잡한 중고차 선택, 이제 가볍게.<br/>차량 조건으로 예상 가격을 확인하고 예산에 맞는 차를 찾아보세요.</p><div className="hero-tags"><span>↗ 조건별 가격 예측</span><span>✓ 내 예산에 맞는 추천</span></div></div><div className="hero-art" aria-hidden="true"><div className="orbit"/><span className="art-label">FIND YOUR PERFECT FIT</span><svg viewBox="0 0 500 250"><ellipse cx="255" cy="208" rx="202" ry="19" fill="#123d32" opacity=".16"/><path d="M56 155 86 119 157 104 211 61 322 64 387 112 436 129 457 172 445 190 65 190 44 174Z" fill="#e2e9df"/><path d="m172 105 48-35 93 3 51 36Z" fill="#204d43"/><path d="m268 72 2 35" stroke="#bacdc0" strokeWidth="6"/><path d="M60 153h380M94 127l41-7m259 4 30 12" stroke="#9bafa2" strokeWidth="5"/><path d="m53 160 50 3-10 13H51m354-29 32 4 7 16-43-5" fill="#fcf6d5"/><path d="m153 124 205 2" stroke="#fafcf6" strokeWidth="3"/><rect x="283" y="119" width="23" height="4" rx="2" fill="#839c90"/>{[130,373].map(x => <g key={x}><circle cx={x} cy="184" r="35" fill="#203a33"/><circle cx={x} cy="184" r="22" fill="#aebfb2"/><circle cx={x} cy="184" r="11" fill="#496357"/></g>)}</svg><div className="art-note"><span>✦</span> 좋은 선택의 시작, CARFIT</div></div></section>
    <div className="workspace"><section className="panel"><div className="section-head"><div><span className="step">01 / DISCOVER</span><h2>{tab === 'predict' ? '내 차, 얼마일까요?' : '어떤 차를 찾으세요?'}</h2></div><span className="badge">DEMO</span></div><div className="tabs"><button className={tab === 'predict' ? 'selected' : ''} onClick={() => setTab('predict')}>가격 예측</button><button className={tab === 'recommend' ? 'selected' : ''} onClick={() => setTab('recommend')}>차량 추천</button></div>
    {tab === 'predict' ? <form onSubmit={predict}><div className="fields"><label>제조사<select value={brand} onChange={e => { setBrand(e.target.value); setModel(cars.find(c => c.brand === e.target.value).model); }}>{['현대', '기아'].map(v => <option key={v}>{v}</option>)}</select></label><label>모델<select value={model} onChange={e => setModel(e.target.value)}>{cars.filter(c => c.brand === brand).map(c => <option key={c.model}>{c.model}</option>)}</select></label><label>연식<select value={year} onChange={e => setYear(e.target.value)}>{Array.from({length: yearNow - 1999}, (_, i) => yearNow - i).map(v => <option key={v} value={v}>{v}년</option>)}</select></label><label>주행거리<div className="input-unit"><input type="number" min="0" max="1000000" required value={mileage} onChange={e => setMileage(e.target.value)}/><span>km</span></div></label></div><fieldset><legend>사고 이력</legend><div className="choices">{['없음', '있음'].map(v => <button key={v} type="button" aria-pressed={accident === v} className={accident === v ? 'chosen' : ''} onClick={() => setAccident(v)}>{accident === v ? '●' : '○'} 사고 {v}</button>)}</div></fieldset>{error && <p role="alert">{error}</p>}<button className="primary" type="submit">예상 가격 확인하기 <span>↗</span></button><p className="fine">입력한 조건을 바탕으로 데모 예상 가격을 계산합니다.</p></form> : <div className="recommend-form"><label>구매 예산 <strong>{money(budget)}만 원 이하</strong><input type="range" min="500" max="5000" step="100" value={budget} onChange={e => setBudget(Number(e.target.value))}/></label><label>선호 차종<select value={type} onChange={e => setType(e.target.value)}>{['전체', '세단', 'SUV', '경차', '전기차'].map(v => <option key={v}>{v}</option>)}</select></label><p className="fine">4년 / 50,000km / 무사고 조건의 예시 차량을 예산순으로 추천합니다.</p><button className="text-button" onClick={() => setOnlySaved(!onlySaved)}>{onlySaved ? '전체 추천 보기' : '관심 차량만 보기'}</button></div>}</section>
    <section className="results" aria-live="polite"><div className="section-head"><div><span className="step">02 / YOUR MATCH</span><h2>{tab === 'predict' ? '예상 가격 리포트' : onlySaved ? '내 관심 차량' : '예산에 맞는 추천 차량'}</h2></div><span className="small-label">{tab === 'predict' ? '차량 조건 분석' : `${recommendations.length}개 모델`}</span></div>{tab === 'predict' ? result ? <div className="report"><span className="badge">예측 완료 · 데모</span><h3>{result.car.brand} {result.car.model}</h3><p>{result.year}년 · {money(result.mileage)}km</p><div className="price">{money(result.price)}<span>만 원</span></div><div className="range">예상 범위 <b>{money(result.price * .9)} ~ {money(result.price * 1.1)}만 원</b></div><p className="report-note">연식, 주행거리, 사고 이력을 반영한 계산 결과입니다. 아래 범위는 통계적 신뢰구간이 아닌 예시 오차 범위 ±10%입니다.</p><button className="text-button" onClick={() => { setBudget(Math.max(500, Math.min(5000, Math.ceil(result.price / 100) * 100))); setTab('recommend'); }}>이 가격대의 다른 차량 보기 →</button></div> : <div className="empty"><div className="empty-icon">↗</div><h3>내 차의 가능성을 확인해 보세요</h3><p>왼쪽에서 차량 정보를 입력하면<br/>예상 가격과 가격 범위를 알려드려요.</p><div className="empty-line"/><span>YOUR CAR. YOUR NEXT CHAPTER.</span></div> : <div className="car-list">{recommendations.length ? recommendations.map(car => <article className="car-card" key={car.model}><div className="car-emoji" aria-hidden="true">{car.icon}</div><div><span className="small-label">{car.brand} · {car.type} · {car.fuel}</span><h3>{car.model}</h3><p>{car.desc}</p><b>{money(car.estimated)}<small>만 원</small></b></div><button className="heart" aria-label={`${car.model} 관심 차량 ${saved.includes(car.model) ? '해제' : '등록'}`} aria-pressed={saved.includes(car.model)} onClick={() => setSaved(saved.includes(car.model) ? saved.filter(v => v !== car.model) : [...saved, car.model])}>{saved.includes(car.model) ? '♥' : '♡'}</button></article>) : <div className="empty"><h3>조건에 맞는 차량이 없어요</h3><p>예산 또는 차종을 변경하거나 관심 차량을 추가해 주세요.</p></div>}</div>}</section></div>
    <aside className="notice"><span>ⓘ</span><p><b>이용 전 확인해 주세요</b> 현재 가격과 차량 정보는 서비스 시연용입니다. 실제 학습 모델이나 실시간 매물 데이터와 연결되어 있지 않으며, 실제 거래 가격과 다를 수 있습니다.</p></aside></main><footer><a className="logo" href="./">CAR<span>FIT</span></a><span>당신의 다음 여정을 위한, 더 나은 선택.</span><small>© {yearNow} CARFIT</small></footer>
  </div>;
}
createRoot(document.getElementById('root')).render(<App/>);
