package com.myapp.myapp.models;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.util.Date;

@Getter
@Setter
@MappedSuperclass

public class BaseEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.AUTO)
    @Column(name = "id", nullable = false, updatable = false)
    private Long id;

    @Column(columnDefinition = "DATETIME", nullable = false, updatable = false)
    private Date createdDate;

    @Column(columnDefinition = "DATETIME", nullable = false, updatable = false)
    private Date updatedDate;

    @PrePersist
    void onCreation(){
        updatedDate = new Date();
        if(createdDate == null){
            createdDate = new Date();
        }
    }
}
