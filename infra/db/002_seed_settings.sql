-- Default calibration settings for modules 1 (third parties), 2 (risk info), 3 (shadow advisory).
INSERT INTO module_settings (module, threshold) VALUES
  (1, 0.6),
  (2, 0.6),
  (3, 0.6)
ON CONFLICT (module) DO NOTHING;
