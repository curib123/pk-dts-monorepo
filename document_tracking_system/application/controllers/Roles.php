<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Roles extends MY_Controller
{
    public function __construct()
    {
        parent::__construct();
        $this->require_login();
        $this->load->model('Rbac_model');
    }

    public function index(): void
    {
        $this->require_permission('roles-permissions.view');
        $this->render('rbac/roles', array(
            'pageTitle' => 'Roles',
            'result' => $this->Rbac_model->roles(dts_page($this->input->get('page')), dts_limit($this->input->get('limit'))),
        ));
    }

    public function view($id = null): void
    {
        $this->require_permission('roles-permissions.view');
        $id = dts_id_string((string) $id);
        $role = $id === null ? null : $this->Rbac_model->role($id);
        if (!$role) {
            show_404();
            return;
        }
        $this->render('rbac/role_view', array('pageTitle' => 'Role details', 'role' => $role));
    }

    public function create(): void { $this->fixed_roles_error(); }
    public function edit($id = null): void { $this->fixed_roles_error(); }
    public function delete($id = null): void { $this->fixed_roles_error(); }

    private function fixed_roles_error(): void
    {
        $this->require_permission('roles-permissions.manage');
        show_error('The five system roles are fixed. Manage their permissions instead.', 400, 'Fixed system roles');
    }
}
