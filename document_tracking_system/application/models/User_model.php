<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class User_model extends MY_Model
{
    public function __construct()
    {
        parent::__construct();
        $this->load->database();
        $this->load->helper('dts_auth');
    }

    public function find_for_auth(string $username): ?array
    {
        $user = $this->base_user_query()
            ->where('u.username', $username)
            ->limit(1)
            ->get()
            ->row_array();

        if (!$user) {
            return null;
        }

        return array(
            'record' => $user,
            'authenticated' => dts_authenticated_user($user, $this->permissions_for_role((string) $user['role_id'])),
        );
    }

    public function find_authenticated_user(string $userId): ?array
    {
        $user = $this->base_user_query()
            ->where('u.user_id', $userId)
            ->limit(1)
            ->get()
            ->row_array();

        if (!$user) {
            return null;
        }

        return dts_authenticated_user($user, $this->permissions_for_role((string) $user['role_id']));
    }

    public function update_password(string $userId, string $passwordHash): bool
    {
        return (bool) $this->db
            ->where('user_id', $userId)
            ->update('users', array(
                'password' => $passwordHash,
                'require_password_change' => false,
                'updated_at' => date('Y-m-d H:i:s'),
            ));
    }

    private function base_user_query()
    {
        return $this->db
            ->select('u.user_id, u.username, u.firstname, u.lastname, u.middlename, u.position_title, u.password, u.require_password_change, u.role_id, r.role_name')
            ->from('users u')
            ->join('roles r', 'r.role_id = u.role_id', 'inner');
    }

    private function permissions_for_role(string $roleId): array
    {
        return $this->db
            ->select('p.permission_id, p.permission_name, p.module_key, p.module_label, p.action_key, p.action_label, p.description')
            ->from('role_permissions rp')
            ->join('permissions p', 'p.permission_id = rp.permission_id', 'inner')
            ->where('rp.role_id', $roleId)
            ->order_by('p.module_key', 'ASC')
            ->order_by('p.action_key', 'ASC')
            ->get()
            ->result_array();
    }
}
