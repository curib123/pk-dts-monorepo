<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Users extends MY_Controller
{
    public function __construct()
    {
        parent::__construct();
        $this->require_login();
        $this->load->model('User_admin_model');
        $this->load->model('Rbac_model');
    }

    public function index(): void
    {
        $this->require_permission('user-accounts.view');
        $page = dts_page($this->input->get('page'));
        $limit = dts_limit($this->input->get('limit'));
        $this->render('users/index', array(
            'pageTitle' => 'Users',
            'result' => $this->User_admin_model->paginate($page, $limit),
        ));
    }

    public function view($id = null): void
    {
        $this->require_permission('user-accounts.view');
        $id = dts_id_string((string) $id);
        if ($id === null) {
            show_404();
            return;
        }
        $user = $this->User_admin_model->find($id);
        if (!$user) {
            show_404();
            return;
        }
        $this->render('users/view', array('pageTitle' => 'User details', 'user' => $user));
    }

    public function create(): void
    {
        $this->require_any_permission(array('user-accounts.create', 'user-accounts.manage'));
        if ($this->input->method(TRUE) === 'POST') {
            try {
                $id = $this->User_admin_model->create($this->input->post(NULL, FALSE) ?: array());
                $this->session->set_flashdata('success', 'User created successfully.');
                redirect('users/view/' . rawurlencode($id));
                return;
            } catch (Throwable $error) {
                $this->session->set_flashdata('error', $error->getMessage());
            }
        }
        $this->render('users/form', array(
            'pageTitle' => 'Create user',
            'user' => array(),
            'roles' => $this->Rbac_model->all_roles(),
            'leaders' => $this->User_admin_model->paginate(1, 100)['items'],
            'formAction' => site_url('users/create'),
        ));
    }

    public function edit($id = null): void
    {
        $id = dts_id_string((string) $id);
        if ($id === null) {
            show_404();
            return;
        }

        $isSelf = (string) ($this->currentUser['user_id'] ?? '') === $id;
        $canManage = $this->allows_any(array('user-accounts.edit', 'user-accounts.manage'));
        if (!$isSelf && !$canManage) {
            show_error('You do not have permission to edit this user.', 403, 'Forbidden');
            return;
        }

        $user = $this->User_admin_model->find($id);
        if (!$user) {
            show_404();
            return;
        }

        if ($this->input->method(TRUE) === 'POST') {
            try {
                $this->User_admin_model->update_user($id, $this->input->post(NULL, FALSE) ?: array(), $canManage);
                $this->session->set_flashdata('success', 'User updated successfully.');
                redirect('users/view/' . rawurlencode($id));
                return;
            } catch (Throwable $error) {
                $this->session->set_flashdata('error', $error->getMessage());
            }
        }

        $this->render('users/form', array(
            'pageTitle' => 'Edit user',
            'user' => $user,
            'roles' => $this->Rbac_model->all_roles(),
            'leaders' => $this->User_admin_model->paginate(1, 100)['items'],
            'canManageAccounts' => $canManage,
            'formAction' => site_url('users/edit/' . rawurlencode($id)),
        ));
    }

    public function delete($id = null): void
    {
        $this->require_any_permission(array('user-accounts.delete', 'user-accounts.manage'));
        if ($this->input->method(TRUE) !== 'POST') {
            show_error('Method Not Allowed', 405);
            return;
        }
        $id = dts_id_string((string) $id);
        if ($id === null) {
            show_404();
            return;
        }
        try {
            $this->User_admin_model->remove_user($id);
            $this->session->set_flashdata('success', 'User deleted successfully.');
        } catch (Throwable $error) {
            $this->session->set_flashdata('error', $error->getMessage());
        }
        redirect('users');
    }

    private function allows_any(array $permissions): bool
    {
        foreach ($permissions as $permission) {
            if ($this->dts_authorization->allows($this->currentUser, $permission)) {
                return true;
            }
        }
        return false;
    }

    private function require_any_permission(array $permissions): void
    {
        if ($this->allows_any($permissions)) {
            return;
        }
        show_error('You do not have permission to perform this action.', 403, 'Forbidden');
        exit;
    }
}
