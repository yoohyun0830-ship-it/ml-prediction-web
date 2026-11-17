package com.example.gateway.service;

import java.time.Duration;
import java.util.Map;
import org.springframework.core.ParameterizedTypeReference;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import com.example.gateway.model.dto.PredictionRequest;

import reactor.core.publisher.Mono;

/*
    차량 추천 서비스 : FastAPI /predict 응답에서 recommendations 배열을 추출한다.
    * Java 는 추천 순위를 계산하거나 정렬하지 않는다.
    * Mono : 응답 JSON 1개 (최대 5개 후보 배열, 없으면 [])
*/
@Service
public class RecommendationService {

    // 1. FastAPI 와 통신하는 논블로킹 HTTP 클라이언트
    private final WebClient webClient;

    // 2. 생성자 주입 : application.properties 의 ai.server.url 값으로 WebClient 생성
    public RecommendationService(@Value("${ai.server.url}") String aiServerUrl) {
        this.webClient = WebClient.create(aiServerUrl);
    }

    // 3. 차량 추천 전달 메소드
    public Mono<Object> recommend(PredictionRequest request) {
        return webClient.post()
                .uri("/predict")                            // 기존 예측 응답에 포함된 추천 배열 사용
                .contentType(MediaType.APPLICATION_JSON)    // 2) 보내는 형식 : JSON
                .accept(MediaType.APPLICATION_JSON)         // 3) 받는 형식 : JSON
                .bodyValue(request)                         // 4) React 요청 DTO 를 그대로 본문에 담기
                .retrieve()
                .bodyToMono(new ParameterizedTypeReference<Map<String, Object>>() {})
                .map(result -> result.get("recommendations"))
                .timeout(Duration.ofSeconds(30))            // 6) 30초 안에 응답이 없으면 시간 초과 오류
                // 7) 연결 실패/시간 초과 시 : 콘솔 출력 후 오류 JSON 반환
                .onErrorResume(e -> {
                    System.out.println("[RecommendationService] AI 서버 통신 오류 : " + e);
                    return Mono.error(new org.springframework.web.server.ResponseStatusException(
                            org.springframework.http.HttpStatus.BAD_GATEWAY, "AI 추천 요청 실패", e));
                });
    }
}
