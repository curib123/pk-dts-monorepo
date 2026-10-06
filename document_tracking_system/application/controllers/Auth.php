<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Auth extends MY_Controller
{
    public function __construct()
    {
        parent::__construct();
        $this->load->model('User_model');
        $this->load->model('Audit_model');
        $this->load->helper('dts_auth');
    }

    public function login(): void
    {
        if ($this->dts_authorization->is_authenticated($this->currentUser)) {
            redirect('/');
            return;
        }

        if ($this->input->method(TRUE) !== 'POST') {
            $this->render('auth/login', array('pageTitle' => 'Sign in'));
            return;
        }

        $username = dts_normalize_username($this->input->post('username', TRUE));
        $password = (string) $this->input->post('password', FALSE);

        if (!dts_valid_username($username) || $password === '') {
            $this->record_login($username, false, null);
            $this->session->set_flashdata('error', 'Invalid username or password.');
            redirect('auth/login');
            return;
        }

        $auth = $this->User_model->find_for_auth($username);
        if (!$auth || !dts_password_verify($password, (string) $auth['record']['password'])) {
            $this->record_login($username, false, $auth['record'] ?? null);
            $this->session->set_flashdata('error', 'Invalid username or password.');
            redirect('auth/login');
            return;
        }

        $this->session->sess_regenerate(TRUE);
        $this->session->set_userdata('dts_user', $auth['authenticated']);
        $this->record_login($username, true, $auth['record']);

        if (!empty($auth['authenticated']['require_password_change'])) {
            redirect('auth/change_password');
            return;
        }

        redirect('/');
    }

    public function logout(): void
    {
        $this->session->unset_userdata('dts_user');
        $this->session->sess_regenerate(TRUE);
        $this->session->set_flashdata('success', 'You have signed out.');
        redirect('auth/login');
    }

    public function me(): void
    {
        $this->require_login();
        $fresh = $this->User_model->find_authenticated_user((string) $this->currentUser['user_id']);

        if (!$fresh) {
            $this->session->unset_userdata('dts_user');
            $this->output->set_status_header(401);
            $this->output->set_content_type('application/json')->set_output(json_encode(array(
                'success' => false,
                'message' => 'The authenticated user no longer exists.',
            )));
            return;
        }

        $this->session->set_userdata('dts_user', $fresh);
        $this->output->set_content_type('application/json')->set_output(json_encode(array(
            'success' => true,
            'data' => $fresh,
        )));
    }

    public function change_password(): void
    {
        $this->require_login();

        if ($this->input->method(TRUE) !== 'POST') {
            $this->render('auth/change_password', array('pageTitle' => 'Change password'));
            return;
        }

        $password = (string) $this->input->post('password', FALSE);
        $confirmation = (string) $this->input->post('password_confirmation', FALSE);

        if ($password === '' || strlen($password) > 255 || !hash_equals($password, $confirmation)) {
            $this->session->set_flashdata('error', 'Enter matching passwords.');
            redirect('auth/change_password');
            return;
        }

        $hash = password_hash($password, PASSWORD_BCRYPT);
        if ($hash === false || !$this->User_model->update_password((string) $this->currentUser['user_id'], $hash)) {
            show_error('Unable to update password.', 500);
            return;
        }

        $fresh = $this->User_model->find_authenticated_user((string) $this->currentUser['user_id']);
        if ($fresh) {
            $this->session->set_userdata('dts_user', $fresh);
        }

        $this->session->set_flashdata('success', 'Password updated.');
        redirect('/');
    }

    private function record_login(string $username, bool $success, ?array $user): void
    {
        try {
            $this->Audit_model->write_login($username, $success, $user);
        } catch (Throwable $error) {
            log_message('error', 'Login audit write failed: ' . $error->getMessage());
        }
    }
}
