<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class User_admin_model extends MY_Model
{
    public function __construct()
    {
        parent::__construct();
        $this->load->database();
        $this->load->helper(array('dts_security', 'dts_auth', 'dts_admin'));
    }

    public function paginate(int $page, int $limit): array
    {
        $offset = ($page - 1) * $limit;
        $total = (int) $this->db->count_all('users');
        $items = $this->db
            ->select('u.user_id, u.firstname, u.lastname, u.middlename, u.username, u.position_title, u.leader_id, u.created_at, u.updated_at, r.role_id, r.role_name, r.description AS role_description, l.firstname AS leader_firstname, l.lastname AS leader_lastname')
            ->from('users u')
            ->join('roles r', 'r.role_id = u.role_id')
            ->join('users l', 'l.user_id = u.leader_id', 'left')
            ->order_by('u.created_at', 'DESC')
            ->limit($limit, $offset)
            ->get()->result_array();

        return array('items' => $items, 'meta' => $this->meta($total, $page, $limit));
    }

    public function find(string $id): ?array
    {
        $user = $this->db
            ->select('u.user_id, u.firstname, u.lastname, u.middlename, u.username, u.position_title, u.role_id, u.leader_id, u.created_at, u.updated_at, r.role_name, r.description AS role_description, l.firstname AS leader_firstname, l.lastname AS leader_lastname')
            ->from('users u')
            ->join('roles r', 'r.role_id = u.role_id')
            ->join('users l', 'l.user_id = u.leader_id', 'left')
            ->where('u.user_id', $id)
            ->get()->row_array();

        if (!$user) {
            return null;
        }

        $registration = $this->db
            ->select('applicant_remarks')
            ->from('account_registration_requests')
            ->where('username', $user['username'])
            ->where('status', 'APPROVED')
            ->order_by('reviewed_at', 'DESC')
            ->limit(1)
            ->get()->row_array();
        $user['applicant_remarks'] = $registration['applicant_remarks'] ?? null;

        return $user;
    }

    public function create(array $data): string
    {
        $username = dts_normalize_username($data['username'] ?? '');
        if (!dts_valid_username($username)) {
            throw new InvalidArgumentException('Invalid username.');
        }
        if ($this->db->where('username', $username)->count_all_results('users') > 0) {
            throw new RuntimeException('A user with this username already exists.');
        }

        $password = (string) ($data['password'] ?? '');
        if ($password === '' || strlen($password) > 255) {
            throw new InvalidArgumentException('Password is required.');
        }

        $insert = array(
            'firstname' => trim((string) ($data['firstname'] ?? '')),
            'lastname' => trim((string) ($data['lastname'] ?? '')),
            'middlename' => $this->nullable($data['middlename'] ?? null),
            'username' => $username,
            'position_title' => $this->nullable($data['position_title'] ?? null),
            'password' => password_hash($password, PASSWORD_BCRYPT, array('cost' => 10)),
            'role_id' => (string) ($data['role_id'] ?? ''),
            'leader_id' => $this->nullable_id($data['leader_id'] ?? null),
            'require_password_change' => false,
            'created_at' => date('Y-m-d H:i:s'),
            'updated_at' => date('Y-m-d H:i:s'),
        );
        if ($insert['firstname'] === '' || $insert['lastname'] === '' || dts_id_string($insert['role_id']) === null) {
            throw new InvalidArgumentException('Name and role are required.');
        }

        $this->db->insert('users', $insert);
        return (string) $this->db->insert_id();
    }

    public function update_user(string $id, array $data, bool $allowAccountManagement): bool
    {
        $changes = array();
        foreach (array('firstname', 'lastname', 'middlename', 'position_title') as $key) {
            if (array_key_exists($key, $data)) {
                $changes[$key] = in_array($key, array('middlename', 'position_title'), true)
                    ? $this->nullable($data[$key])
                    : trim((string) $data[$key]);
            }
        }
        if (array_key_exists('username', $data)) {
            $username = dts_normalize_username($data['username']);
            if (!dts_valid_username($username)) {
                throw new InvalidArgumentException('Invalid username.');
            }
            $duplicate = $this->db->where('username', $username)->where('user_id !=', $id)->count_all_results('users');
            if ($duplicate > 0) {
                throw new RuntimeException('A user with this username already exists.');
            }
            $changes['username'] = $username;
        }
        if (!empty($data['password'])) {
            $changes['password'] = password_hash((string) $data['password'], PASSWORD_BCRYPT, array('cost' => 10));
        }
        if ($allowAccountManagement) {
            if (array_key_exists('role_id', $data) && dts_id_string((string) $data['role_id']) !== null) {
                $changes['role_id'] = (string) $data['role_id'];
            }
            if (array_key_exists('leader_id', $data)) {
                $changes['leader_id'] = $this->nullable_id($data['leader_id']);
            }
        }
        $changes['updated_at'] = date('Y-m-d H:i:s');

        return (bool) $this->db->where('user_id', $id)->update('users', $changes);
    }

    public function remove_user(string $id): void
    {
        $user = $this->db
            ->select('u.user_id, r.role_name')
            ->from('users u')
            ->join('roles r', 'r.role_id = u.role_id')
            ->where('u.user_id', $id)
            ->get()->row_array();
        if (!$user) {
            throw new RuntimeException('User not found.');
        }

        $createdDocuments = $this->db->where('created_by', $id)->count_all_results('documents');
        $uploadedRevisions = $this->db->where('uploaded_by', $id)->count_all_results('document_revisions');
        if ($createdDocuments > 0 || $uploadedRevisions > 0) {
            throw new RuntimeException('User cannot be deleted because they are linked to document history.');
        }

        if (dts_is_administrative_role($user['role_name'])) {
            $administratorCount = (int) $this->db
                ->from('users u')
                ->join('roles r', 'r.role_id = u.role_id')
                ->where('r.role_name', 'Admin')
                ->count_all_results();
            if ($administratorCount <= 1) {
                throw new RuntimeException('The last administrator cannot be deleted.');
            }
        }

        $this->db->where('user_id', $id)->delete('users');
    }

    private function nullable($value)
    {
        $value = trim((string) $value);
        return $value === '' ? null : $value;
    }

    private function nullable_id($value)
    {
        if ($value === null || $value === '') {
            return null;
        }
        return dts_id_string((string) $value);
    }

    private function meta(int $total, int $page, int $limit): array
    {
        $pages = $limit > 0 ? (int) ceil($total / $limit) : 0;
        return array(
            'total' => $total,
            'page' => $page,
            'limit' => $limit,
            'total_pages' => $pages,
            'has_next_page' => $page < $pages,
            'has_previous_page' => $page > 1,
        );
    }
}
