package com.example.gateway.controller;

import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.example.gateway.model.dto.RecommendationRequest;
import com.example.gateway.service.RecommendationService;

import reactor.core.publisher.Mono;

/*
    차량 추천 컨트롤러 : React 의 추천 요청을 받는 창구
    * FastAPI 가 준 JSON(후보 최대 3개 배열, 없으면 []) 을 가공 없이 그대로 응답
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
    public Mono<String> recommend(@RequestBody RecommendationRequest request) {
        System.out.println("[RecommendationController] 차량 추천 요청 수신 : " + request);
        return recommendationService.recommend(request); // Mono 를 그대로 반환 (.block() 없음)
    }
}
