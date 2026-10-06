<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Dts_authorization
{
    public function is_authenticated($user): bool
    {
        return is_array($user)
            && isset($user['user_id'])
            && dts_id_string((string) $user['user_id']) !== null;
    }

    public function allows($user, string $permission): bool
    {
        if (!$this->is_authenticated($user) || $permission === '') {
            return false;
        }

        $permissions = $user['role']['permissions'] ?? array();
        if (!is_array($permissions)) {
            return false;
        }

        return in_array($permission, $permissions, true);
    }
}
