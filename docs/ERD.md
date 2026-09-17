# 달빛 사주 ERD

아래 ERD는 `server/migrations/001_initial.sql`, `002_auth.sql` 기준입니다.

```mermaid
erDiagram
    APP_USERS {
        uuid id PK
        text status
        text display_name
        text email
        timestamptz created_at
        timestamptz updated_at
        timestamptz last_login_at
    }

    AUTH_IDENTITIES {
        uuid id PK
        uuid user_id FK
        text provider
        text provider_subject
        text email
        timestamptz created_at
        timestamptz last_login_at
    }

    AUTH_SESSIONS {
        text token_hash PK
        uuid user_id FK
        timestamptz created_at
        timestamptz last_seen_at
        timestamptz expires_at
    }

    ANONYMOUS_SESSIONS {
        text id PK
        uuid user_id FK
        timestamptz created_at
        timestamptz last_seen_at
        timestamptz expires_at
    }

    SAJU_JOURNALS {
        text session_id PK_FK
        uuid user_id FK
        jsonb payload
        integer revision
        timestamptz updated_at
    }

    USAGE_SESSIONS {
        uuid id PK
        text anonymous_session_id FK
        text feature
        text status
        timestamptz started_at
        timestamptz completed_at
    }

    LLM_REQUESTS {
        bigint id PK
        uuid usage_session_id FK
        text provider
        text model
        text key_label
        text status
        text finish_reason
        integer input_tokens
        integer output_tokens
        integer latency_ms
        text error_code
        timestamptz created_at
    }

    AUDIT_LOGS {
        bigint id PK
        text anonymous_session_id FK
        text event_type
        text resource_type
        text resource_id
        jsonb metadata
        timestamptz created_at
    }

    APP_USERS ||--o{ AUTH_IDENTITIES : "로그인 수단"
    APP_USERS ||--o{ AUTH_SESSIONS : "인증 세션"
    APP_USERS o|--o{ ANONYMOUS_SESSIONS : "계정 연결"
    APP_USERS o|--o| SAJU_JOURNALS : "사용자별 저널"
    ANONYMOUS_SESSIONS ||--o| SAJU_JOURNALS : "비회원 저널"
    ANONYMOUS_SESSIONS o|--o{ USAGE_SESSIONS : "기능 사용"
    USAGE_SESSIONS o|--o{ LLM_REQUESTS : "LLM 요청"
    ANONYMOUS_SESSIONS o|--o{ AUDIT_LOGS : "감사 기록"
```

## 핵심 관계

- 한 사용자는 Google·Apple 등 여러 `auth_identities`를 가질 수 있습니다.
- 로그인 세션은 원문 토큰이 아닌 `token_hash`로 저장됩니다.
- 비회원은 `anonymous_sessions.id`를 기준으로 저널을 저장합니다.
- 로그인 후 저널은 `saju_journals.user_id`에도 연결되며 사용자당 하나만 허용됩니다.
- 실제 사주, 상담, 선택 및 기록 데이터는 `saju_journals.payload` JSONB에 저장됩니다.
- LLM 사용량은 `usage_sessions`와 `llm_requests`로 나눠 기록합니다.

## 삭제 동작

- 사용자 삭제 시 `auth_identities`, `auth_sessions`, 사용자 저널은 `CASCADE` 삭제됩니다.
- 사용자 삭제 시 `anonymous_sessions.user_id`는 `NULL`로 변경됩니다.
- 익명 세션 삭제 시 연결된 비회원 저널은 `CASCADE` 삭제됩니다.
- 사용 세션·감사 로그의 익명 세션 연결은 원본 세션 삭제 시 `NULL`로 변경됩니다.
