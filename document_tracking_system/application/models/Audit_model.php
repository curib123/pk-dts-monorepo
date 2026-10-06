<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Audit_model extends MY_Model
{
    public function __construct()
    {
        parent::__construct();
        $this->load->database();
        $this->load->library('audit_context');
    }

    public function write_login(string $username, bool $success, ?array $user = null): void
    {
        $context = $this->audit_context->from_server($_SERVER);
        $this->db->insert('audit_logs', array(
            'user_id' => $user['user_id'] ?? null,
            'user_name' => $user ? trim(($user['firstname'] ?? '') . ' ' . ($user['lastname'] ?? '')) : 'Unknown user',
            'user_username' => substr($username, 0, 150),
            'role_name' => $user['role_name'] ?? 'UNKNOWN',
            'action' => $success ? 'LOGIN' : 'LOGIN_FAILED',
            'module' => 'auth',
            'description' => $success ? 'signed in successfully' : 'failed to sign in',
            'method' => $context['method'],
            'path' => '/auth/login',
            'entity_id' => isset($user['user_id']) ? (string) $user['user_id'] : null,
            'metadata' => json_encode(array('username' => $username)),
            'reason' => $success ? null : 'Invalid username or password.',
            'ip_address' => $context['ip_address'],
            'user_agent' => $context['user_agent'],
            'created_at' => date('Y-m-d H:i:s'),
        ));
    }
}
