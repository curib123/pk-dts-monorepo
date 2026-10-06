<?php
defined('BASEPATH') OR exit('No direct script access allowed');
class Areas extends MY_Controller
{
    private $read=array('storage-classification.view','documents.create','documents.edit','document-requests.create','document-requests.edit');
    public function __construct(){parent::__construct();$this->require_login();$this->load->model('Storage_master_model');}
    public function index():void{$this->require_any($this->read);$this->render('master/index',array('pageTitle'=>'Areas','entityLabel'=>'Area','createUrl'=>site_url('areas/create'),'columns'=>array('area_name'=>'Area'),'items'=>$this->Storage_master_model->areas(dts_page($this->input->get('page')),dts_limit($this->input->get('limit')))['items'],'viewBase'=>'areas/view/'));}
    public function view($id=null):void{$this->require_any($this->read);$row=$this->entity_id($id)?$this->Storage_master_model->area((string)$id):null;if(!$row){show_404();return;}$this->render('master/detail',array('pageTitle'=>'Area details','row'=>$row));}
    public function create():void{$this->require_any(array('storage-classification.create','storage-classification.manage'));$this->save(null);}
    public function edit($id=null):void{$this->require_any(array('storage-classification.edit','storage-classification.manage'));$this->save($this->entity_id($id));}
    public function delete($id=null):void{$this->require_any(array('storage-classification.delete','storage-classification.manage'));$id=$this->entity_id($id);if($id&&$this->input->method(TRUE)==='POST'){$this->Storage_master_model->delete_area($id);$this->session->set_flashdata('success','Area deleted.');}redirect('areas');}
    private function save(?string $id):void{if($this->input->method(TRUE)==='POST'){try{$saved=$this->Storage_master_model->save_area($id,(string)$this->input->post('area_name',TRUE));$this->session->set_flashdata('success','Area saved.');redirect('areas/view/'.$saved);return;}catch(Throwable $e){$this->session->set_flashdata('error',$e->getMessage());}}$row=$id?$this->Storage_master_model->area($id):array();$this->render('master/form',array('pageTitle'=>$id?'Edit area':'Create area','formAction'=>site_url($id?'areas/edit/'.$id:'areas/create'),'fields'=>array(array('name'=>'area_name','label'=>'Area name','value'=>$row['area_name']??'','required'=>true))));}
    private function entity_id($id):?string{return dts_id_string((string)$id);}
    private function require_any(array $p):void{foreach($p as $x)if($this->dts_authorization->allows($this->currentUser,$x))return;show_error('Forbidden',403);exit;}
}
