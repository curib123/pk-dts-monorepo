<?php
defined('BASEPATH') OR exit('No direct script access allowed');
class System_settings extends MY_Controller
{
    public function __construct(){parent::__construct();$this->load->model('System_settings_model');}
    public function appearance():void
    {
        if($this->input->method(TRUE)==='POST'){
            $this->require_permission('system-settings.manage');
            try{$settings=$this->System_settings_model->update_appearance($this->input->post(NULL,FALSE)?:array());$this->session->set_flashdata('success','Appearance updated.');}catch(Throwable $e){$this->session->set_flashdata('error',$e->getMessage());$settings=$this->System_settings_model->appearance();}
        }else{$settings=$this->System_settings_model->appearance();}
        if($this->input->get('format')==='json'){$this->output->set_content_type('application/json')->set_output(json_encode($settings));return;}
        $this->render('settings/appearance',array('pageTitle'=>'Appearance','settings'=>$settings));
    }
}
