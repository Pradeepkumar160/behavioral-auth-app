CREATE TABLE `admin_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`admin_id` int NOT NULL,
	`action` varchar(100) NOT NULL,
	`target_user_id` int,
	`target_session_id` varchar(255),
	`details` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `admin_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `behavior_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`session_id` varchar(255) NOT NULL,
	`event_type` varchar(50) NOT NULL,
	`event_data` json,
	`anomaly_score` float,
	`risk_level` varchar(20),
	`risk_action` varchar(20),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `behavior_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `behavioral_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`typing_profile` json,
	`mouse_profile` json,
	`model_data` text,
	`training_data_count` int DEFAULT 0,
	`is_active` boolean DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `behavioral_profiles_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`session_id` varchar(255) NOT NULL,
	`current_risk_score` float DEFAULT 0,
	`risk_level` varchar(20) DEFAULT 'LOW',
	`risk_action` varchar(20) DEFAULT 'Allow',
	`is_active` boolean DEFAULT true,
	`requires_reauth` boolean DEFAULT false,
	`is_blocked` boolean DEFAULT false,
	`login_time` timestamp NOT NULL DEFAULT (now()),
	`last_activity_time` timestamp NOT NULL DEFAULT (now()),
	`logout_time` timestamp,
	CONSTRAINT `sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `sessions_session_id_unique` UNIQUE(`session_id`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `password` varchar(255);