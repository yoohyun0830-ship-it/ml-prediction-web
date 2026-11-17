package com.example.gateway.service;

import java.io.IOException;
import java.time.Duration;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.MediaType;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import com.example.gateway.model.dto.PredictionRequest;

import reactor.core.Disposable;
import reactor.core.publisher.Flux;

/*
    가격 예측 서비스 : FastAPI /predict/stream 의 SSE 를 받아서 React 로 그대로 중계
    * Java 는 가격을 계산하지 않는다. 받은 이벤트의 event 이름과 data 를 "그대로" 전달만 한다.
    * FastAPI 가 보내는 순서 : progress(여러 개) → result → done  (실패 시 error)
    * 받는 쪽(FastAPI → Java) : WebClient 가 SSE 를 Flux 로 받는다 (이벤트가 0~N개, 시간차를 두고 흘러옴)
    * 보내는 쪽(Java → React) : SseEmitter 로 이벤트가 도착할 때마다 바로 send() 한다
*/
@Service
public class PredictionService {

    private final WebClient webClient;

    public PredictionService(@Value("${server.url:http://127.0.0.1:8000}") String aiServerUrl) {
        this.webClient = WebClient.create(aiServerUrl);
    }

    public SseEmitter predictStream(PredictionRequest request) {
        SseEmitter emitter = new SseEmitter(60_000L);
        Disposable subscription = fetchFromAi(request).subscribe(
                sse -> {
                    try {
                        emitter.send(SseEmitter.event()
                                .name(sse.event() == null ? "message" : sse.event()) // event 이름 그대로
                                .data(sse.data() == null ? "" : sse.data()));         // data(JSON) 그대로
                    } catch (IOException e) {

                        System.out.println("[PredictionService] React 연결 끊김 : " + e.getMessage());
                        emitter.completeWithError(e);
                    }
                },
                emitter::completeWithError, 
                emitter::complete           
        );

        emitter.onCompletion(subscription::dispose);
        emitter.onTimeout(() -> {
            subscription.dispose();
            emitter.complete();
        });
        emitter.onError(e -> subscription.dispose());

        return emitter;
    }

    
    private Flux<ServerSentEvent<String>> fetchFromAi(PredictionRequest request) {
        return webClient.post()
                .uri("/predict/stream")                    
                .contentType(MediaType.APPLICATION_JSON)    // 2) 보내는 형식 : JSON
                .accept(MediaType.TEXT_EVENT_STREAM)        // 3) 받는 형식 : SSE
                .bodyValue(request)                         
                .retrieve()
                
                .bodyToFlux(new ParameterizedTypeReference<ServerSentEvent<String>>() {})
           
                .timeout(Duration.ofSeconds(30))
               
                .onErrorResume(e -> {
                    System.out.println("[PredictionService] AI 서버 통신 오류 : " + e);
                    ServerSentEvent<String> errorEvent = ServerSentEvent.<String>builder()
                            .event("error")
                            .data(ErrorMessage.toJson(e))
                            .build();
                    return Flux.just(errorEvent);
                });
    }

  
    static class ErrorMessage {
        static String toJson(Throwable e) {
            String message = "AI 서버 연결 실패";
            if (e instanceof WebClientResponseException responseError) {
                message = "AI 서버 요청 거절 (" + responseError.getStatusCode().value() + ") : "
                        + responseError.getResponseBodyAsString();
            }
            // JSON 문자열 안에 넣을 수 있도록 \ 와 " 와 줄바꿈을 이스케이프
            String escaped = message.replace("\\", "\\\\").replace("\"", "\\\"")
                    .replace("\n", " ").replace("\r", " ");
            return "{\"message\":\"" + escaped + "\"}";
        }
    }
}
