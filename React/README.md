# CARFIT React

실제 LightGBM 예측 결과를 Spring SSE를 통해 표시하는 React 화면입니다.

프로젝트 최상위 폴더에서 Python(8000), Java(8080)를 먼저 실행한 뒤:

```powershell
npm.cmd --prefix React ci
npm.cmd --prefix React run dev
```

브라우저: http://127.0.0.1:5173/

- CSV의 제조사·모델 선택지와 기본 조건을 Spring `/api/catalog`에서 가져옵니다.
- 예산 입력은 만 원 단위이며 요청에는 원(KRW)으로 변환합니다.
- axios fetch 어댑터로 `/api/predictions/stream`에 POST하고 SSE를 파싱합니다.
- 진행 상태, 실제 모델 가격, R²·MAE, 추천 차량, 요청 취소·오류·재시도를 지원합니다.
- 관심 차량은 페이지 메모리에 보관되며 새로고침 시 초기화됩니다.
- 가격은 인도 데이터 기반 예측의 원화 환산값이며, 추천 차량은 실시간 판매 매물이 아닙니다.

전체 서버 실행과 연동 검증은 프로젝트 최상위 README.md를 참고하세요.

```powershell
node --test React/test/sse.test.mjs
npm.cmd --prefix React run build
node React/scripts/check-integration.mjs
```

`/api` 프록시는 개발 서버 설정입니다. 배포 시에도 같은 경로를 Spring으로 전달하는 리버스 프록시가 필요합니다.
