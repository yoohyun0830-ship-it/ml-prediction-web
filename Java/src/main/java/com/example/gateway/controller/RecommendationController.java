package com.example.gateway.controller;

import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.example.gateway.model.dto.PredictionRequest;
import com.example.gateway.service.RecommendationService;

import reactor.core.publisher.Mono;

/*
    차량 추천 컨트롤러 : React 의 추천 요청을 받는 창구
    * FastAPI 예측 응답에 포함된 추천 배열(최대 5개)을 반환한다.
*/
@RestController
@RequestMapping("/api")
@CrossOrigin(origins = "*")   // React(5173 포트)는 Java(8080 포트)와 주소가 달라서 CORS 허용 필요
public class RecommendationController {

    private final RecommendationService recommendationService;

    // 생성자 주입 : 스프링이 RecommendationService 객체를 자동으로 넣어줌
    public RecommendationController(RecommendationService recommendationService) {
        this.recommendationService = recommendationService;
    }

    // 1. http://localhost:8080/api/recommendations  [POST]  응답 : JSON
    @PostMapping(value = "/recommendations", produces = MediaType.APPLICATION_JSON_VALUE)
    public Mono<Object> recommend(@RequestBody PredictionRequest request) {
        System.out.println("[RecommendationController] 차량 추천 요청 수신 : " + request);
        return recommendationService.recommend(request); // Mono 를 그대로 반환 (.block() 없음)
    }
}
