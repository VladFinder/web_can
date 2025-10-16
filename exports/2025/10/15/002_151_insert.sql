BEGIN TRANSACTION;
-- Using existing generationId = 54
INSERT INTO canData (pid, pidMask, formula, canBusId, canParameterId, generationId, busType, conditionOffset, conditionLength, dimension) VALUES (X'', X'', '', 12, 19, 54, 1, 16, 16, (SELECT COALESCE(dimension_ru, dimension_en) FROM dimensions WHERE id=5));
COMMIT;