<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Role_permissions extends MY_Controller
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
        $this->render('rbac/role_permissions', array(
            'pageTitle' => 'Role permissions',
            'result' => $this->Rbac_model->role_permissions(dts_page($this->input->get('page')), dts_limit($this->input->get('limit'))),
            'roles' => $this->Rbac_model->all_roles(),
            'permissions' => $this->Rbac_model->all_permissions(),
        ));
    }

    public function assign(): void
    {
        $this->require_permission('roles-permissions.manage');
        if ($this->input->method(TRUE) !== 'POST') {
            show_error('Method Not Allowed', 405);
            return;
        }
        $roleId = dts_id_string((string) $this->input->post('role_id', TRUE));
        $permissionId = dts_id_string((string) $this->input->post('permission_id', TRUE));
        try {
            if ($roleId === null || $permissionId === null) {
                throw new InvalidArgumentException('Role and permission are required.');
            }
            $this->Rbac_model->assign($roleId, $permissionId);
            $this->session->set_flashdata('success', 'Permission assigned successfully.');
        } catch (Throwable $error) {
            $this->session->set_flashdata('error', $error->getMessage());
        }
        redirect('role_permissions');
    }

    public function remove($id = null): void
    {
        $this->require_permission('roles-permissions.manage');
        if ($this->input->method(TRUE) !== 'POST') {
            show_error('Method Not Allowed', 405);
            return;
        }
        $id = dts_id_string((string) $id);
        try {
            if ($id === null) {
                throw new InvalidArgumentException('Role permission is required.');
            }
            $this->Rbac_model->unassign($id);
            $this->session->set_flashdata('success', 'Permission removed successfully.');
        } catch (Throwable $error) {
            $this->session->set_flashdata('error', $error->getMessage());
        }
        redirect('role_permissions');
    }
}
