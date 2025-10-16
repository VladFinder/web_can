BEGIN TRANSACTION;
-- Using existing generationId = 54
INSERT INTO canData (pid, pidMask, is29Bit, formula, canBusId, canParameterId, generationId, busType, deprecated, conditionOffset, conditionLength, dimension)
VALUES (X'0066', X'FFFF000000000000', 0, '', 12, 254, 54, 1, 0, NULL, NULL, 6);
COMMIT;