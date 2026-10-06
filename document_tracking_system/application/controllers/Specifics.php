<?php
defined('BASEPATH') OR exit('No direct script access allowed');
class Specifics extends MY_Controller
{
    private $read=array('storage-classification.view','documents.create','documents.edit','document-requests.create','document-requests.edit');
    public function __construct(){parent::__construct();$this->require_login();$this->load->model('Storage_master_model');}
    public function index():void{$this->require_any($this->read);$r=$this->Storage_master_model->specifics(dts_page($this->input->get('page')),dts_limit($this->input->get('limit')));$this->render('master/index',array('pageTitle'=>'Specifics','entityLabel'=>'Specific','createUrl'=>site_url('specifics/create'),'columns'=>array('specific_name'=>'Specific','area_name'=>'Area'),'items'=>$r['items'],'viewBase'=>'specifics/view/'));}
    public function view($id=null):void{$this->require_any($this->read);$id=dts_id_string((string)$id);$row=$id?$this->Storage_master_model->specific($id):null;if(!$row){show_404();return;}$this->render('master/detail',array('pageTitle'=>'Specific details','row'=>$row));}
    public function create():void{$this->require_any(array('storage-classification.create','storage-classification.manage'));$this->save(null);}
    public function edit($id=null):void{$this->require_any(array('storage-classification.edit','storage-classification.manage'));$this->save(dts_id_string((string)$id));}
    public function delete($id=null):void{$this->require_any(array('storage-classification.delete','storage-classification.manage'));$id=dts_id_string((string)$id);if($id&&$this->input->method(TRUE)==='POST')$this->Storage_master_model->delete_specific($id);redirect('specifics');}
    private function save(?string $id):void{if($this->input->method(TRUE)==='POST'){try{$saved=$this->Storage_master_model->save_specific($id,(string)$this->input->post('specific_name',TRUE),$this->input->post('area_id',TRUE));redirect('specifics/view/'.$saved);return;}catch(Throwable $e){$this->session->set_flashdata('error',$e->getMessage());}}$row=$id?$this->Storage_master_model->specific($id):array();$this->render('master/form',array('pageTitle'=>$id?'Edit specific':'Create specific','formAction'=>site_url($id?'specifics/edit/'.$id:'specifics/create'),'fields'=>array(array('name'=>'specific_name','label'=>'Specific name','value'=>$row['specific_name']??'','required'=>true),array('name'=>'area_id','label'=>'Area','type'=>'select','value'=>$row['area_id']??'','options'=>$this->Storage_master_model->area_options(),'optionValue'=>'area_id','optionLabel'=>'area_name','empty'=>'None'))));}
    private function require_any(array $p):void{foreach($p as $x)if($this->dts_authorization->allows($this->currentUser,$x))return;show_error('Forbidden',403);exit;}
}
