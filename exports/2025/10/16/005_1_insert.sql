BEGIN TRANSACTION;
INSERT INTO manufacturers(manufacturerName) VALUES ('Abarth');
-- manufacturerId = last_insert_rowid()
INSERT INTO carsModels(carModelName, manufacturerId) VALUES ('mi-DO', last_insert_rowid());
-- carModelId = last_insert_rowid()
INSERT INTO generations(generationName, carModelId, MajorVersion, MinorVersion) VALUES ('', last_insert_rowid(), 0, 0);
-- generationId = last_insert_rowid()
WITH g(id) AS (SELECT last_insert_rowid()) SELECT * FROM g;
INSERT INTO canParameters(canParameterName_ru) VALUES ('привет');
-- canParameterId = last_insert_rowid()
INSERT INTO canData (pid, pidMask, is29Bit, formula, canBusId, canParameterId, generationId, busType, deprecated, conditionOffset, conditionLength, dimension)
VALUES (X'0001', X'0000FF0000000000', 0, '', 12, last_insert_rowid(), last_insert_rowid(), 1, 0, NULL, NULL, 6);
COMMIT;