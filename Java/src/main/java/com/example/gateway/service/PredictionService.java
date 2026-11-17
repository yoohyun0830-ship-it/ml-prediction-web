package com.example.gateway.service;

import java.time.Duration;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.MediaType;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import com.example.gateway.model.dto.PredictionRequest;

import reactor.core.publisher.Flux;

/*
    가격 예측 서비스 : FastAPI /predict/stream 의 SSE 를 받아서 React 로 그대로 중계
    * Java 는 가격을 계산하지 않는다. 받은 이벤트를 "전달"만 한다.
    * Flux : 데이터가 0~N개, 시간차를 두고 하나씩 흘러오는 통로 (progress 3개 + result 1개)
    * 논블로킹 : .block() 으로 기다리지 않고, 이벤트가 도착할 때마다 바로 다음으로 넘긴다.
*/
@Service
public class PredictionService {

    // 1. FastAPI 와 통신하는 논블로킹 HTTP 클라이언트
    private final WebClient webClient;

    // 2. 생성자 주입 : application.properties 의 ai.server.url 값으로 WebClient 생성
    public PredictionService(@Value("${ai.server.url}") String aiServerUrl) {
        this.webClient = WebClient.create(aiServerUrl);
    }

    // 3. 가격 예측 SSE 중계 메소드
    public Flux<ServerSentEvent<String>> predictStream(PredictionRequest request) {
        return webClient.post()
                .uri("/predict/stream")                     // 1) FastAPI 예측 주소
                .contentType(MediaType.APPLICATION_JSON)    // 2) 보내는 형식 : JSON
                .accept(MediaType.TEXT_EVENT_STREAM)        // 3) 받는 형식 : SSE
                .bodyValue(request)                         // 4) React 요청 DTO 를 그대로 본문에 담기
                .retrieve()
                // 5) SSE 이벤트 하나하나를 ServerSentEvent 객체로 받기 → event 이름(progress/result/error)과 data 보존
                .bodyToFlux(new ParameterizedTypeReference<ServerSentEvent<String>>() {})
                // 6) 30초 동안 다음 이벤트가 오지 않으면 시간 초과 오류
                .timeout(Duration.ofSeconds(30))
                // 7) 연결 실패/시간 초과 시 : 콘솔 출력 후 error 이벤트 1개를 대신 보냄
                .onErrorResume(e -> {
                    System.out.println("[PredictionService] AI 서버 통신 오류 : " + e);
                    ServerSentEvent<String> errorEvent = ServerSentEvent.<String>builder()
                            .event("error")
                            .data("{\"type\":\"error\",\"message\":\"AI 서버 연결 실패\"}")
                            .build();
                    return Flux.just(errorEvent);
                });
    }
}
