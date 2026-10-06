<?php
defined('BASEPATH') OR exit('No direct script access allowed');

if (!function_exists('dts_normalize_username')) {
    function dts_normalize_username($value): string
    {
        return strtolower(trim((string) $value));
    }
}

if (!function_exists('dts_valid_username')) {
    function dts_valid_username($value): bool
    {
        return preg_match('/^[a-zA-Z0-9][a-zA-Z0-9._@+-]{0,149}$/', (string) $value) === 1;
    }
}

if (!function_exists('dts_password_verify')) {
    function dts_password_verify(string $plain, string $hash): bool
    {
        return $hash !== '' && password_verify($plain, $hash);
    }
}

if (!function_exists('dts_authenticated_user')) {
    function dts_authenticated_user(array $user, array $permissions): array
    {
        $details = array();
        $names = array();

        foreach ($permissions as $permission) {
            if (empty($permission['permission_name'])) {
                continue;
            }

            $detail = array(
                'permission_id' => (string) ($permission['permission_id'] ?? ''),
                'permission_name' => (string) $permission['permission_name'],
                'module_key' => (string) ($permission['module_key'] ?? ''),
                'module_label' => (string) ($permission['module_label'] ?? ''),
                'action_key' => (string) ($permission['action_key'] ?? ''),
                'action_label' => (string) ($permission['action_label'] ?? ''),
                'description' => $permission['description'] ?? null,
            );
            $details[] = $detail;
            $names[] = $detail['permission_name'];
        }

        return array(
            'user_id' => (string) $user['user_id'],
            'username' => (string) $user['username'],
            'firstname' => (string) $user['firstname'],
            'lastname' => (string) $user['lastname'],
            'require_password_change' => !empty($user['require_password_change']),
            'role' => array(
                'role_id' => (string) $user['role_id'],
                'role_name' => (string) $user['role_name'],
                'permissions' => $names,
                'permission_details' => $details,
            ),
        );
    }
}
