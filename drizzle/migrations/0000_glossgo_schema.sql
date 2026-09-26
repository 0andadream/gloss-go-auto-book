CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE public.appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  confirmation_code text NOT NULL UNIQUE,
  customer_name text NOT NULL,
  phone text NOT NULL,
  email text NOT NULL,
  vehicle_type text NOT NULL,
  package text NOT NULL,
  duration_minutes int NOT NULL,
  address text NOT NULL,
  travel_buffer_minutes int NOT NULL,
  block_start timestamptz NOT NULL,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  price numeric(10,2) NOT NULL,
  deposit_amount numeric(10,2) NOT NULL DEFAULT 25,
  deposit_status text NOT NULL DEFAULT 'pending' CHECK (deposit_status IN ('pending','paid','refunded')),
  status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','rescheduled','cancelled','no_show')),
  source text NOT NULL DEFAULT 'booked' CHECK (source IN ('booked','rescheduled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT no_overlap EXCLUDE USING gist (tstzrange(block_start, end_time, '[)') WITH &&) WHERE (status <> 'cancelled')
);
CREATE INDEX ON public.appointments (start_time);
CREATE INDEX ON public.appointments (phone);
GRANT ALL ON public.appointments TO service_role;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  message text NOT NULL
);
GRANT ALL ON public.activity_log TO service_role;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text NOT NULL,
  email text NOT NULL,
  last_step_reached text NOT NULL,
  status text NOT NULL DEFAULT 'in_progress',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.leads TO service_role;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

WITH d AS (SELECT date_trunc('day', now() AT TIME ZONE 'America/Chicago') AS today)
INSERT INTO public.appointments (confirmation_code, customer_name, phone, email, vehicle_type, package, duration_minutes, address, travel_buffer_minutes, block_start, start_time, end_time, price, deposit_amount, deposit_status, status, source)
SELECT v.code, v.name, v.phone, v.email, v.vt, v.pkg, v.dur, v.addr, v.buf,
  ((d.today + v.dayoff * interval '1 day' + v.startmin * interval '1 minute') AT TIME ZONE 'America/Chicago') - v.buf * interval '1 minute',
  (d.today + v.dayoff * interval '1 day' + v.startmin * interval '1 minute') AT TIME ZONE 'America/Chicago',
  (d.today + v.dayoff * interval '1 day' + (v.startmin + v.dur) * interval '1 minute') AT TIME ZONE 'America/Chicago',
  v.price, 25, 'paid', 'confirmed', 'booked'
FROM d, (VALUES
  ('K7Q2MX','Dana Whitfield','5125550142','dana@example.com','SUV','Full Detail',110,'1400 S Congress Ave, South Austin',25,1,600,209.00),
  ('P3LZ8R','Omar Castillo','5125550187','omar@example.com','Sedan','Premium Detail',150,'600 Congress Ave, Downtown',15,1,900,299.00),
  ('B9TW4N','Jess Nguyen','5125550113','jess@example.com','Truck','Premium Detail',170,'11410 Century Oaks Terrace, Domain',30,2,540,319.00),
  ('H2VC6Y','Luis Moreno','5125550166','luis@example.com','Coupe','Express Wash',30,'1100 E 6th St, East Austin',20,3,780,59.00),
  ('R5JD1E','Priya Shah','5125550199','priya@example.com','Van','Full Detail',110,'4500 Duval St, Hyde Park',20,5,1020,209.00)
) AS v(code,name,phone,email,vt,pkg,dur,addr,buf,dayoff,startmin,price);

INSERT INTO public.activity_log (message) VALUES ('System online — seeded 5 existing appointments');