// Run against Vite, not directly against Python, to check the whole HTTP chain.
import assert from 'node:assert/strict';
import { api, predictStream } from '../src/api.mjs';

api.defaults.baseURL = process.argv[2] || 'http://127.0.0.1:5173/api';
const { data: catalog } = await api.get('/catalog');
assert.equal(catalog.currency, 'KRW');
assert.ok(catalog.metrics.usable_rows >= 2000);
const model = catalog.models.find(car => car.make === 'Honda' && car.model === 'Amaze 1.2 VX i-VTEC') || catalog.models[0];
const input = { make: model.make, model: model.model, year: model.year, kilometer: model.kilometer, fuelType: model.fuel, transmission: model.transmission, owner: model.owner, budget: 10000000, budget_currency: 'KRW' };
const events = [];
let result;
await predictStream(input, message => {
  events.push(message.event);
  if (message.event === 'result') result = message.data;
}, AbortSignal.timeout(45000));
assert.deepEqual(events, ['progress', 'progress', 'progress', 'result', 'done']);
assert.ok(result.predictedPrice > 0);
assert.equal(result.currency, 'KRW');
assert.equal(result.budget_used, input.budget);
assert.equal(result.r2, catalog.metrics.r2);
assert.ok(result.recommendations.every(car => car.predicted_price <= input.budget));
const { data: recommendations } = await api.post('/recommendations', input);
assert.deepEqual(recommendations, result.recommendations);
await assert.rejects(predictStream({ ...input, model: 'UNKNOWN MODEL' }, () => {}, AbortSignal.timeout(45000)), /입력값/);
console.log(JSON.stringify({ status: 'PASS', path: 'Vite → Spring → FastAPI → axios SSE parser', events, priceKrw: result.predictedPrice, r2: result.r2, recommendations: result.recommendations.length, invalidInput: 'error event verified' }, null, 2));
