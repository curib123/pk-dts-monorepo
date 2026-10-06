<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Home extends MY_Controller
{
    public function index(): void
    {
        $data = $this->viewData;
        $data['message'] = 'CodeIgniter 3 migration foundation is active.';
        $this->load->view('migration/home', $data);
    }
}
