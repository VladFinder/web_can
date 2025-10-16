BEGIN TRANSACTION;
-- Using existing generationId = 54
INSERT INTO canData (pid, pidMask, is29Bit, formula, canBusId, canParameterId, generationId, busType, deprecated, conditionOffset, conditionLength, dimension) VALUES (X'000000DE', X'000007FF', 0, '', 1, 254, 54, 1, 0, NULL, NULL, 8);
COMMIT;