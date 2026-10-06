<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Rbac_model extends MY_Model
{
    public function __construct()
    {
        parent::__construct();
        $this->load->database();
    }

    public function roles(int $page, int $limit): array
    {
        $offset = ($page - 1) * $limit;
        $total = (int) $this->db->count_all('roles');
        $items = $this->db
            ->select('r.role_id, r.role_name, r.description, COUNT(DISTINCT u.user_id) AS user_count, COUNT(DISTINCT rp.role_permission_id) AS permission_count', false)
            ->from('roles r')
            ->join('users u', 'u.role_id = r.role_id', 'left')
            ->join('role_permissions rp', 'rp.role_id = r.role_id', 'left')
            ->group_by(array('r.role_id', 'r.role_name', 'r.description'))
            ->order_by('r.role_name', 'ASC')
            ->limit($limit, $offset)->get()->result_array();
        return $this->page($items, $total, $page, $limit);
    }

    public function role(string $id): ?array
    {
        $role = $this->db->where('role_id', $id)->get('roles')->row_array();
        if (!$role) return null;
        $role['users'] = $this->db->select('user_id, firstname, lastname, username')->where('role_id', $id)->order_by('lastname')->get('users')->result_array();
        $role['permissions'] = $this->db
            ->select('rp.role_permission_id, p.permission_id, p.permission_name, p.module_key, p.module_label, p.action_key, p.action_label, p.description')
            ->from('role_permissions rp')->join('permissions p', 'p.permission_id = rp.permission_id')
            ->where('rp.role_id', $id)->order_by('p.module_label')->order_by('p.action_label')->get()->result_array();
        return $role;
    }

    public function permissions(int $page, int $limit): array
    {
        $offset = ($page - 1) * $limit;
        $total = (int) $this->db->count_all('permissions');
        $items = $this->db->order_by('module_label')->order_by('action_label')->limit($limit, $offset)->get('permissions')->result_array();
        return $this->page($items, $total, $page, $limit);
    }

    public function permission(string $id): ?array
    {
        $permission = $this->db->where('permission_id', $id)->get('permissions')->row_array();
        if (!$permission) return null;
        $permission['roles'] = $this->db
            ->select('rp.role_permission_id, r.role_id, r.role_name')
            ->from('role_permissions rp')->join('roles r', 'r.role_id = rp.role_id')
            ->where('rp.permission_id', $id)->order_by('r.role_name')->get()->result_array();
        return $permission;
    }

    public function role_permissions(int $page, int $limit): array
    {
        $offset = ($page - 1) * $limit;
        $total = (int) $this->db->count_all('role_permissions');
        $items = $this->db
            ->select('rp.role_permission_id, rp.role_id, rp.permission_id, r.role_name, p.permission_name, p.module_label, p.action_label')
            ->from('role_permissions rp')
            ->join('roles r', 'r.role_id = rp.role_id')
            ->join('permissions p', 'p.permission_id = rp.permission_id')
            ->order_by('rp.role_permission_id', 'ASC')
            ->limit($limit, $offset)->get()->result_array();
        return $this->page($items, $total, $page, $limit);
    }

    public function assign(string $roleId, string $permissionId): string
    {
        if (!$this->db->where('role_id', $roleId)->count_all_results('roles') ||
            !$this->db->where('permission_id', $permissionId)->count_all_results('permissions')) {
            throw new RuntimeException('Role or permission was not found.');
        }
        $existing = $this->db->where('role_id', $roleId)->where('permission_id', $permissionId)->get('role_permissions')->row_array();
        if ($existing) {
            return (string) $existing['role_permission_id'];
        }
        $this->db->insert('role_permissions', array('role_id' => $roleId, 'permission_id' => $permissionId));
        return (string) $this->db->insert_id();
    }

    public function unassign(string $id): void
    {
        if (!$this->db->where('role_permission_id', $id)->count_all_results('role_permissions')) {
            throw new RuntimeException('Role permission was not found.');
        }
        $this->db->where('role_permission_id', $id)->delete('role_permissions');
    }

    public function all_roles(): array
    {
        return $this->db->order_by('role_name')->get('roles')->result_array();
    }

    public function all_permissions(): array
    {
        return $this->db->order_by('module_label')->order_by('action_label')->get('permissions')->result_array();
    }

    private function page(array $items, int $total, int $page, int $limit): array
    {
        $pages = (int) ceil($total / max(1, $limit));
        return array('items' => $items, 'meta' => array(
            'total' => $total, 'page' => $page, 'limit' => $limit, 'total_pages' => $pages,
            'has_next_page' => $page < $pages, 'has_previous_page' => $page > 1,
        ));
    }
}
