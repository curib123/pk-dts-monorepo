<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class MY_Controller extends CI_Controller
{
    protected $viewData = array();
    protected $currentUser = null;

    public function __construct()
    {
        parent::__construct();

        $this->load->library('session');
        $this->load->library('dts_authorization');
        $this->load->helper(array('url', 'dts_security'));

        $this->currentUser = $this->session->userdata('dts_user');
        $this->viewData = array(
            'applicationName' => 'PK DTS',
            'environment' => defined('ENVIRONMENT') ? ENVIRONMENT : 'unknown',
            'currentUser' => $this->currentUser,
            'navigation' => array(),
        );
    }

    protected function require_login(): void
    {
        if ($this->dts_authorization->is_authenticated($this->currentUser)) {
            return;
        }

        $this->session->set_flashdata('error', 'Please sign in to continue.');
        redirect('auth/login');
        exit;
    }

    protected function require_permission(string $permission): void
    {
        $this->require_login();

        if ($this->dts_authorization->allows($this->currentUser, $permission)) {
            return;
        }

        show_error('You do not have permission to perform this action.', 403, 'Forbidden');
        exit;
    }

    protected function render(string $view, array $data = array()): void
    {
        $payload = array_merge($this->viewData, $data);
        $payload['contentView'] = $view;
        $this->load->view('layouts/app', $payload);
    }
}
