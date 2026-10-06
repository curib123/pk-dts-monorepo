<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Registrations extends MY_Controller
{
    public function __construct()
    {
        parent::__construct();
        $this->load->model('Registration_model');
    }

    public function index(): void
    {
        if ($this->input->method(TRUE) === 'POST') {
            try {
                $result = $this->Registration_model->create_request($this->input->post(NULL, FALSE) ?: array());
                $this->session->set_flashdata('success', 'Registration submitted. Reference: ' . $result['reference_code']);
                redirect('registrations/status?reference=' . rawurlencode($result['reference_code']));
                return;
            } catch (Throwable $error) {
                $this->session->set_flashdata('error', $error->getMessage());
            }
        }
        $this->render('registrations/register', array(
            'pageTitle' => 'Account registration',
            'roles' => $this->Registration_model->public_roles(),
        ));
    }

    public function status(): void
    {
        $registration = null;
        if ($this->input->method(TRUE) === 'POST') {
            $registration = $this->Registration_model->status(
                (string) $this->input->post('username', TRUE),
                (string) $this->input->post('reference_code', TRUE)
            );
            if (!$registration) {
                $this->session->set_flashdata('error', 'No registration matches that username and reference code.');
            }
        }
        $this->render('registrations/status', array(
            'pageTitle' => 'Registration status',
            'registration' => $registration,
            'reference' => (string) $this->input->get('reference', TRUE),
        ));
    }

    public function reference(): void
    {
        $result = null;
        if ($this->input->method(TRUE) === 'POST') {
            $result = $this->Registration_model->latest_reference((string) $this->input->post('username', TRUE));
            if (!$result) {
                $this->session->set_flashdata('error', 'No registration request was found for this username.');
            }
        }
        $this->render('registrations/reference', array('pageTitle' => 'Find registration reference', 'result' => $result));
    }

    public function pending(): void
    {
        $this->require_any_permission(array('user-accounts.approve', 'user-accounts.manage'));
        $this->render('registrations/pending', array(
            'pageTitle' => 'Pending registrations',
            'result' => $this->Registration_model->pending(dts_page($this->input->get('page')), dts_limit($this->input->get('limit'))),
            'roles' => $this->Registration_model->public_roles(),
        ));
    }

    public function review($id = null): void
    {
        $this->require_any_permission(array('user-accounts.approve', 'user-accounts.manage'));
        if ($this->input->method(TRUE) !== 'POST') {
            show_error('Method Not Allowed', 405);
            return;
        }
        $id = dts_id_string((string) $id);
        try {
            if ($id === null) {
                throw new InvalidArgumentException('Registration request is required.');
            }
            $this->Registration_model->review(
                $id,
                (string) $this->input->post('status', TRUE),
                $this->input->post('assigned_role_id', TRUE),
                $this->input->post('review_remarks', TRUE),
                (string) $this->currentUser['user_id']
            );
            $this->session->set_flashdata('success', 'Registration reviewed successfully.');
        } catch (Throwable $error) {
            $this->session->set_flashdata('error', $error->getMessage());
        }
        redirect('registrations/pending');
    }

    private function require_any_permission(array $permissions): void
    {
        $this->require_login();
        foreach ($permissions as $permission) {
            if ($this->dts_authorization->allows($this->currentUser, $permission)) {
                return;
            }
        }
        show_error('You do not have permission to perform this action.', 403, 'Forbidden');
        exit;
    }
}
