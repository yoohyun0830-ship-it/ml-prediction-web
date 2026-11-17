package com.example.gateway.controller;

import org.springframework.http.MediaType;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.example.gateway.model.dto.PredictionRequest;
import com.example.gateway.service.PredictionService;

import reactor.core.publisher.Flux;

/*
    가격 예측 컨트롤러 : React 의 예측 요청을 받는 창구
    * produces = text/event-stream → Flux 에서 이벤트가 나올 때마다
      "event:progress / data:{...}" 형식으로 React 에 즉시 전송된다 (모아서 한 번에 보내지 않음)
*/
@RestController
@RequestMapping("/api")
@CrossOrigin(origins = "*")   // React(5173 포트)는 Java(8080 포트)와 주소가 달라서 CORS 허용 필요
public class PredictionController {

    private final PredictionService predictionService;

    // 생성자 주입 : 스프링이 PredictionService 객체를 자동으로 넣어줌
    public PredictionController(PredictionService predictionService) {
        this.predictionService = predictionService;
    }

    // 1. http://localhost:8080/api/predictions/stream  [POST]  응답 : SSE
    @PostMapping(value = "/predictions/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<ServerSentEvent<String>> predictStream(@RequestBody PredictionRequest request) {
        System.out.println("[PredictionController] 가격 예측 요청 수신 : " + request);
        return predictionService.predictStream(request); // Flux 를 그대로 반환 (.block() 없음)
    }
}
