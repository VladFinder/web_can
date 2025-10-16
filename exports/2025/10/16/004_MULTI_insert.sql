BEGIN TRANSACTION;
-- Using existing generationId = 1622
INSERT INTO canData (pid, pidMask, is29Bit, formula, canBusId, canParameterId, generationId, busType, deprecated, conditionOffset, conditionLength, dimension)
VALUES (X'0789', X'FFFFFF0000000000', 0, '', 12, 254, 1622, 1, 0, NULL, NULL, 6);
INSERT INTO canData (pid, pidMask, is29Bit, formula, canBusId, canParameterId, generationId, busType, deprecated, conditionOffset, conditionLength, dimension)
VALUES (X'0546', X'0000FFFFFFFF0000', 0, '', 12, 265, 1622, 1, 0, NULL, NULL, 3);
COMMIT;