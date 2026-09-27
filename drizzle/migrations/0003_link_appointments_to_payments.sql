ALTER TABLE public.appointments ADD COLUMN payment_tx_ref text;
CREATE UNIQUE INDEX appointments_payment_tx_ref_unique ON public.appointments (payment_tx_ref) WHERE payment_tx_ref IS NOT NULL;
COMMENT ON COLUMN public.appointments.payment_tx_ref IS 'Flutterwave transaction reference used for idempotent payment completion';