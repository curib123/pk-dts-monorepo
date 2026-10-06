<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Registration_model extends MY_Model
{
    public function __construct()
    {
        parent::__construct();
        $this->load->database();
        $this->load->helper(array('dts_admin', 'dts_auth', 'dts_security'));
    }

    public function public_roles(): array
    {
        $roles = $this->db->select('role_id, role_name, description')->order_by('role_name')->get('roles')->result_array();
        return array_values(array_filter($roles, function ($role) {
            return !dts_is_administrative_role($role['role_name'] ?? '');
        }));
    }

    public function create_request(array $data): array
    {
        $username = dts_normalize_username($data['username'] ?? '');
        $roleId = dts_id_string((string) ($data['requested_role_id'] ?? ''));
        if (!dts_valid_username($username) || !$roleId) throw new InvalidArgumentException('Invalid registration data.');
        if ($this->db->where('username', $username)->count_all_results('users') > 0) throw new RuntimeException('An account with this username already exists.');
        if ($this->db->where('username', $username)->where('status', 'PENDING')->count_all_results('account_registration_requests') > 0) throw new RuntimeException('A pending registration already exists for this username.');

        $role = $this->db->select('role_id, role_name')->where('role_id', $roleId)->get('roles')->row_array();
        if (!$role || dts_is_administrative_role($role['role_name'])) throw new RuntimeException('The requested role is not available for public registration.');

        $password = (string) ($data['password'] ?? '');
        if ($password === '' || strlen($password) > 255) throw new InvalidArgumentException('Password is required.');

        $reference = dts_registration_reference();
        $this->db->insert('account_registration_requests', array(
            'reference_code' => $reference,
            'firstname' => trim((string) ($data['firstname'] ?? '')),
            'lastname' => trim((string) ($data['lastname'] ?? '')),
            'middlename' => $this->nullable($data['middlename'] ?? null),
            'username' => $username,
            'position_title' => $this->nullable($data['position_title'] ?? null),
            'applicant_remarks' => $this->nullable($data['applicant_remarks'] ?? null),
            'password_hash' => password_hash($password, PASSWORD_BCRYPT, array('cost' => 10)),
            'status' => 'PENDING',
            'requested_role_id' => $roleId,
            'created_at' => date('Y-m-d H:i:s'),
            'updated_at' => date('Y-m-d H:i:s'),
        ));
        return array('reference_code' => $reference, 'status' => 'PENDING', 'requested_role' => $role);
    }

    public function status(string $username, string $reference): ?array
    {
        return $this->db
            ->select('ar.reference_code, ar.firstname, ar.lastname, ar.status, ar.review_remarks, ar.created_at, ar.reviewed_at, rr.role_name AS requested_role_name, ra.role_name AS assigned_role_name')
            ->from('account_registration_requests ar')
            ->join('roles rr', 'rr.role_id = ar.requested_role_id')
            ->join('roles ra', 'ra.role_id = ar.assigned_role_id', 'left')
            ->where('ar.username', dts_normalize_username($username))
            ->where('ar.reference_code', strtoupper(trim($reference)))
            ->get()->row_array() ?: null;
    }

    public function latest_reference(string $username): ?array
    {
        return $this->db->select('reference_code, status, created_at')
            ->where('username', dts_normalize_username($username))
            ->order_by('created_at', 'DESC')->limit(1)->get('account_registration_requests')->row_array() ?: null;
    }

    public function pending(int $page, int $limit): array
    {
        $offset = ($page - 1) * $limit;
        $total = (int) $this->db->where('status', 'PENDING')->count_all_results('account_registration_requests');
        $items = $this->db
            ->select('ar.registration_id, ar.firstname, ar.lastname, ar.middlename, ar.username, ar.position_title, ar.applicant_remarks, ar.status, ar.created_at, r.role_id AS requested_role_id, r.role_name AS requested_role_name, r.description AS requested_role_description')
            ->from('account_registration_requests ar')->join('roles r', 'r.role_id = ar.requested_role_id')
            ->where('ar.status', 'PENDING')->order_by('ar.created_at', 'ASC')->limit($limit, $offset)->get()->result_array();
        return array('items' => $items, 'meta' => array('total' => $total, 'page' => $page, 'limit' => $limit, 'total_pages' => (int) ceil($total / max(1, $limit))));
    }

    public function review(string $id, string $status, ?string $assignedRoleId, ?string $remarks, string $reviewerId): array
    {
        $status = strtoupper(trim($status));
        if (!in_array($status, array('APPROVED', 'REJECTED'), true)) throw new InvalidArgumentException('Registration can only be approved or rejected.');

        $this->db->trans_start();
        $registration = $this->db->query('SELECT * FROM account_registration_requests WHERE registration_id = ? FOR UPDATE', array($id))->row_array();
        if (!$registration) throw new RuntimeException('Registration request not found.');
        if ($registration['status'] !== 'PENDING') throw new RuntimeException('This registration request was already reviewed.');

        $roleId = null;
        if ($status === 'APPROVED') {
            $roleId = dts_id_string((string) $assignedRoleId);
            if (!$roleId) throw new InvalidArgumentException('Assigned role is required.');
            $role = $this->db->select('role_id, role_name')->where('role_id', $roleId)->get('roles')->row_array();
            if (!$role) throw new RuntimeException('The assigned role no longer exists.');
            if (dts_is_administrative_role($role['role_name'])) throw new RuntimeException('Administrative roles cannot be assigned through account registration approval.');
            if ($this->db->where('username', $registration['username'])->count_all_results('users') > 0) throw new RuntimeException('An account with this username already exists.');

            $this->db->insert('users', array(
                'firstname' => $registration['firstname'], 'lastname' => $registration['lastname'],
                'middlename' => $registration['middlename'], 'username' => $registration['username'],
                'position_title' => $registration['position_title'], 'password' => $registration['password_hash'],
                'role_id' => $roleId, 'require_password_change' => false,
                'created_at' => date('Y-m-d H:i:s'), 'updated_at' => date('Y-m-d H:i:s'),
            ));
        }

        $reviewedAt = date('Y-m-d H:i:s');
        $this->db->where('registration_id', $id)->update('account_registration_requests', array(
            'status' => $status, 'assigned_role_id' => $roleId, 'review_remarks' => $this->nullable($remarks),
            'reviewed_by_user_id' => $reviewerId, 'reviewed_at' => $reviewedAt, 'updated_at' => $reviewedAt,
        ));
        $this->db->trans_complete();
        if (!$this->db->trans_status()) throw new RuntimeException('Unable to review registration.');

        return array('registration_id' => $id, 'status' => $status, 'reviewed_at' => $reviewedAt);
    }

    private function nullable($value)
    {
        $value = trim((string) $value);
        return $value === '' ? null : $value;
    }
}
