package com.example.gateway.service;

import java.time.Duration;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import com.example.gateway.model.dto.RecommendationRequest;

import reactor.core.publisher.Mono;

/*
    차량 추천 서비스 : FastAPI /recommend 의 JSON 응답을 React 로 그대로 전달
    * Java 는 추천 순위를 계산하거나 정렬하지 않는다. 받은 JSON 문자열을 그대로 넘긴다.
    * Mono : 데이터가 0~1개만 오는 통로 (응답 JSON 1개 : 후보 최대 3개 배열, 없으면 [])
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
    public Mono<String> recommend(RecommendationRequest request) {
        return webClient.post()
                .uri("/recommend")                          // 1) FastAPI 추천 주소
                .contentType(MediaType.APPLICATION_JSON)    // 2) 보내는 형식 : JSON
                .accept(MediaType.APPLICATION_JSON)         // 3) 받는 형식 : JSON
                .bodyValue(request)                         // 4) React 요청 DTO 를 그대로 본문에 담기
                .retrieve()
                .bodyToMono(String.class)                   // 5) 응답 JSON 을 가공 없이 문자열 그대로 받기
                .timeout(Duration.ofSeconds(30))            // 6) 30초 안에 응답이 없으면 시간 초과 오류
                // 7) 연결 실패/시간 초과 시 : 콘솔 출력 후 오류 JSON 반환
                .onErrorResume(e -> {
                    System.out.println("[RecommendationService] AI 서버 통신 오류 : " + e);
                    return Mono.just("{\"error\":\"AI 서버 연결 실패\"}");
                });
    }
}
