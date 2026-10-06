<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Permissions extends MY_Controller
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
        $this->render('rbac/permissions', array(
            'pageTitle' => 'Permissions',
            'result' => $this->Rbac_model->permissions(dts_page($this->input->get('page')), dts_limit($this->input->get('limit'))),
        ));
    }

    public function view($id = null): void
    {
        $this->require_permission('roles-permissions.view');
        $id = dts_id_string((string) $id);
        $permission = $id === null ? null : $this->Rbac_model->permission($id);
        if (!$permission) {
            show_404();
            return;
        }
        $this->render('rbac/permission_view', array('pageTitle' => 'Permission details', 'permission' => $permission));
    }

    public function create(): void { $this->catalog_error(); }
    public function edit($id = null): void { $this->catalog_error(); }
    public function delete($id = null): void { $this->catalog_error(); }

    private function catalog_error(): void
    {
        $this->require_permission('roles-permissions.manage');
        show_error('The permission catalog is system-managed and cannot be changed manually.', 400, 'System-managed permissions');
    }
}
