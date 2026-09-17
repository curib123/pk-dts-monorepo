-- Persist the Workflow Builder route used by each hardcopy transfer request.
ALTER TABLE `hardcopy_transfer_requests`
    ADD COLUMN `workflow_version_id` BIGINT NULL,
    ADD COLUMN `workflow_version` INTEGER NULL,
    ADD COLUMN `workflow_name` VARCHAR(150) NULL,
    ADD COLUMN `workflow_snapshot` JSON NULL;

CREATE TABLE `hardcopy_transfer_workflow_steps` (
    `workflow_step_id` BIGINT NOT NULL AUTO_INCREMENT,
    `transfer_request_id` BIGINT NOT NULL,
    `node_key` VARCHAR(100) NOT NULL,
    `sequence` INTEGER NOT NULL,
    `stage` VARCHAR(60) NOT NULL,
    `stage_label` VARCHAR(150) NOT NULL,
    `assignment_type` VARCHAR(30) NULL,
    `assignment_source` VARCHAR(50) NULL,
    `assigned_user_id` BIGINT NOT NULL,
    `assigned_role_id` BIGINT NULL,
    `assigned_user_name_snapshot` VARCHAR(255) NOT NULL,
    `assigned_position_title_snapshot` VARCHAR(150) NULL,
    `status` ENUM('QUEUED', 'PENDING', 'APPROVED', 'RETURNED', 'REJECTED') NOT NULL DEFAULT 'QUEUED',
    `decision` VARCHAR(30) NULL,
    `comments` TEXT NULL,
    `acted_by_user_id` BIGINT NULL,
    `acted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `hardcopy_transfer_workflow_steps_transfer_request_id_node_key_key` (`transfer_request_id`, `node_key`),
    INDEX `hardcopy_transfer_workflow_steps_assigned_user_id_status_idx` (`assigned_user_id`, `status`),
    INDEX `hardcopy_transfer_workflow_steps_transfer_request_id_status_idx` (`transfer_request_id`, `status`),
    PRIMARY KEY (`workflow_step_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `hardcopy_transfer_workflow_history` (
    `workflow_history_id` BIGINT NOT NULL AUTO_INCREMENT,
    `workflow_step_id` BIGINT NOT NULL,
    `previous_status` ENUM('QUEUED', 'PENDING', 'APPROVED', 'RETURNED', 'REJECTED') NULL,
    `new_status` ENUM('QUEUED', 'PENDING', 'APPROVED', 'RETURNED', 'REJECTED') NOT NULL,
    `action` VARCHAR(40) NOT NULL,
    `performed_by_user_id` BIGINT NOT NULL,
    `comments` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `hardcopy_transfer_workflow_history_workflow_step_id_created_at_idx` (`workflow_step_id`, `created_at`),
    PRIMARY KEY (`workflow_history_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `hardcopy_transfer_requests`
    ADD COLUMN `current_workflow_step_id` BIGINT NULL,
    ADD UNIQUE INDEX `hardcopy_transfer_requests_current_workflow_step_id_key` (`current_workflow_step_id`),
    ADD CONSTRAINT `hardcopy_transfer_requests_workflow_version_id_fkey`
        FOREIGN KEY (`workflow_version_id`) REFERENCES `workflow_versions`(`workflow_version_id`) ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT `hardcopy_transfer_requests_current_workflow_step_id_fkey`
        FOREIGN KEY (`current_workflow_step_id`) REFERENCES `hardcopy_transfer_workflow_steps`(`workflow_step_id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `hardcopy_transfer_workflow_steps`
    ADD CONSTRAINT `hardcopy_transfer_workflow_steps_transfer_request_id_fkey`
        FOREIGN KEY (`transfer_request_id`) REFERENCES `hardcopy_transfer_requests`(`transfer_request_id`) ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT `hardcopy_transfer_workflow_steps_assigned_user_id_fkey`
        FOREIGN KEY (`assigned_user_id`) REFERENCES `users`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT `hardcopy_transfer_workflow_steps_assigned_role_id_fkey`
        FOREIGN KEY (`assigned_role_id`) REFERENCES `roles`(`role_id`) ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT `hardcopy_transfer_workflow_steps_acted_by_user_id_fkey`
        FOREIGN KEY (`acted_by_user_id`) REFERENCES `users`(`user_id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `hardcopy_transfer_workflow_history`
    ADD CONSTRAINT `hardcopy_transfer_workflow_history_workflow_step_id_fkey`
        FOREIGN KEY (`workflow_step_id`) REFERENCES `hardcopy_transfer_workflow_steps`(`workflow_step_id`) ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT `hardcopy_transfer_workflow_history_performed_by_user_id_fkey`
        FOREIGN KEY (`performed_by_user_id`) REFERENCES `users`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;
