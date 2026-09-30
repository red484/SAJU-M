CREATE TABLE coach_answers (
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  request_id varchar(100) NOT NULL,
  question_hash text NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, request_id)
);
