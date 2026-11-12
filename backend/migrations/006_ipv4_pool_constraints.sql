-- Restrict gateway address pools to usable IPv4 subnets.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'gateways_ipv4_cidr_usable_check'
  ) THEN
    ALTER TABLE gateways ADD CONSTRAINT gateways_ipv4_cidr_usable_check
      CHECK (ipv4_cidr IS NULL OR (family(ipv4_cidr) = 4 AND masklen(ipv4_cidr) BETWEEN 16 AND 30));
  END IF;
END $$;
