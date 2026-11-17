package com.example.gateway.model.dto;

/*
    가격 예측 요청 DTO (React → Java → FastAPI)
    * record : 필드 + 생성자 + getter 를 자동으로 만들어주는 불변 데이터 클래스 (Lombok 불필요)
    * 필드명은 JSON 키와 똑같이 camelCase 로 작성 → 자동으로 JSON <-> 객체 변환
    * 예) {"make":"Honda","model":"City","year":2017,"kilometer":87150,
           "fuelType":"Petrol","transmission":"Manual","owner":"First"}
*/
public record PredictionRequest(
        String make,          // 1. 제조사
        String model,         // 2. 모델명
        Integer year,         // 3. 연식
        Integer kilometer,    // 4. 주행거리(km)
        String fuelType,      // 5. 연료 종류
        String transmission,  // 6. 변속기
        String owner          // 7. 소유자 이력
) {
}
