-- Restrict new delivery to Kottayam; preserve historical orders and zones.
UPDATE delivery_zones SET is_active = false, updated_at = now()
WHERE pincode NOT IN ('686001', '686002', '686003', '686004', '686005', '686006', '686007', '686008', '686009', '686010', '686011', '686012', '686013', '686014', '686015', '686016', '686017', '686018', '686019', '686020', '686021', '686022', '686041', '686101', '686102', '686103', '686104', '686105', '686106', '686121', '686122', '686123', '686141', '686143', '686144', '686146', '686501', '686502', '686503', '686504', '686505', '686506', '686507', '686508', '686509', '686510', '686512', '686513', '686514', '686515', '686516', '686517', '686518', '686519', '686520', '686521', '686522', '686531', '686532', '686533', '686535', '686536', '686537', '686538', '686539', '686540', '686541', '686542', '686543', '686544', '686545', '686546', '686548', '686555', '686560', '686561', '686562', '686563', '686564', '686571', '686572', '686573', '686574', '686575', '686576', '686577', '686578', '686579', '686580', '686581', '686582', '686583', '686584', '686585', '686586', '686587', '686601', '686602', '686603', '686604', '686605', '686606', '686607', '686608', '686609', '686610', '686611', '686612', '686613', '686616', '686630', '686631', '686632', '686633', '686634', '686635', '686636', '686637', '686651', '686652', '686653');
--> statement-breakpoint
-- Suggested launch areas are paused; enabling one is an explicit shop decision.
INSERT INTO delivery_zones (pincode, area_name_en, area_name_ml, min_order_paise, delivery_fee_paise, free_delivery_threshold_paise, is_active) VALUES
  ('686001', 'Kottayam Town', 'കോട്ടയം ടൗൺ', 9900, 2900, 49900, false),
  ('686631', 'Ettumanoor', 'ഏറ്റുമാനൂർ', 14900, 3900, 59900, false),
  ('686575', 'Pala', 'പാലാ', 19900, 4900, 69900, false),
  ('686101', 'Changanassery', 'ചങ്ങനാശ്ശേരി', 19900, 4900, 69900, false),
  ('686141', 'Vaikom', 'വൈക്കം', 24900, 5900, 79900, false)
ON CONFLICT (pincode) DO NOTHING;
--> statement-breakpoint
-- Replace only the old example address, keeping the rest of the shop profile.
UPDATE settings SET value = jsonb_set(value, '{addressLine}', '"PGRS Peedika, Kottayam district, Kerala"'::jsonb), updated_at = now()
WHERE key = 'shop.profile' AND value->>'addressLine' = 'PGRS Peedika, Market Road, Kannur, Kerala 670001';
