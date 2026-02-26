package com.panvel.crm.mcp;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cache.annotation.EnableCaching;

@SpringBootApplication
@EnableCaching
public class CrmMcpServiceApplication {

    public static void main(String[] args) {
        SpringApplication.run(CrmMcpServiceApplication.class, args);
    }
}
