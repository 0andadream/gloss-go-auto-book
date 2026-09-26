CREATE TABLE public.pending_payments (
  tx_ref text PRIMARY KEY,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.pending_payments TO service_role;
ALTER TABLE public.pending_payments ENABLE ROW LEVEL SECURITY;