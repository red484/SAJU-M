CREATE TABLE product_event_counts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  day date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Seoul')::date,
  channel text NOT NULL CHECK (channel IN ('web','android','ios','toss')),
  event text NOT NULL CHECK (event IN ('purchase_view','purchase_product_error','purchase_start','purchase_granted','purchase_restored','consultation_first_answer','choice_saved','review_saved')),
  count bigint NOT NULL DEFAULT 1 CHECK (count > 0),
  UNIQUE (day, channel, event)
);
