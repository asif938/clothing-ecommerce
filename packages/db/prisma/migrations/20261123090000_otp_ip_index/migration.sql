-- Per-IP OTP send limit (auth.otpMaxSendsPerIpPer10Min) counts recent codes by IP.
CREATE INDEX IF NOT EXISTS "otp_codes_ip_created_at_idx" ON "otp_codes"("ip", "created_at");
