-- Fix admins table defaults safely
DROP PROCEDURE IF EXISTS FixAdminsTableDefaults;
DELIMITER //
CREATE PROCEDURE FixAdminsTableDefaults()
BEGIN
    -- Handle is_active column
    IF NOT EXISTS (
        SELECT * FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'admins' 
        AND COLUMN_NAME = 'is_active'
    ) THEN
        ALTER TABLE admins ADD COLUMN is_active BIT(1) NOT NULL DEFAULT 1;
    ELSE
        ALTER TABLE admins MODIFY COLUMN is_active BIT(1) NOT NULL DEFAULT 1;
    END IF;

    -- Handle is_superadmin column
    IF NOT EXISTS (
        SELECT * FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'admins' 
        AND COLUMN_NAME = 'is_superadmin'
    ) THEN
        ALTER TABLE admins ADD COLUMN is_superadmin BIT(1) NOT NULL DEFAULT 0;
    ELSE
        ALTER TABLE admins MODIFY COLUMN is_superadmin BIT(1) NOT NULL DEFAULT 0;
    END IF;
END //
DELIMITER ;
CALL FixAdminsTableDefaults();
DROP PROCEDURE FixAdminsTableDefaults;
