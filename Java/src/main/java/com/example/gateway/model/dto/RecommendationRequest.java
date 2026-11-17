package com.example.gateway.model.dto;

/*
    차량 추천 요청 DTO (React → Java → FastAPI)
    * 필드명은 JSON 키와 똑같이 camelCase
    * 예) {"maxBudget":600000,"minSeats":5,"transmission":"Manual"}
*/
public record RecommendationRequest(
        Long maxBudget,       // 1. 최대 예산
        Integer minSeats,     // 2. 최소 좌석 수
        String transmission   // 3. 변속기
) {
}
