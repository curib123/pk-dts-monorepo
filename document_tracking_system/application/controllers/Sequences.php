<?php
defined('BASEPATH') OR exit('No direct script access allowed');
class Sequences extends MY_Controller
{
    private $read=array('storage-classification.view','documents.create','documents.edit','document-requests.create','document-requests.edit');
    public function __construct(){parent::__construct();$this->require_login();$this->load->model('Storage_master_model');}
    public function index():void{$this->require_any($this->read);$r=$this->Storage_master_model->sequences(dts_page($this->input->get('page')),dts_limit($this->input->get('limit')));$this->render('master/index',array('pageTitle'=>'Sequences','entityLabel'=>'Sequence','createUrl'=>site_url('sequences/create'),'columns'=>array('sequence_code'=>'Sequence code'),'items'=>$r['items'],'viewBase'=>'sequences/view/'));}
    public function view($id=null):void{$this->require_any($this->read);$id=dts_id_string((string)$id);$row=$id?$this->Storage_master_model->sequence($id):null;if(!$row){show_404();return;}$this->render('master/detail',array('pageTitle'=>'Sequence details','row'=>$row));}
    public function create():void{$this->require_any(array('storage-classification.create','storage-classification.manage'));$this->save(null);}
    public function edit($id=null):void{$this->require_any(array('storage-classification.edit','storage-classification.manage'));$this->save(dts_id_string((string)$id));}
    public function delete($id=null):void{$this->require_any(array('storage-classification.delete','storage-classification.manage'));$id=dts_id_string((string)$id);if($id&&$this->input->method(TRUE)==='POST')$this->Storage_master_model->delete_sequence($id);redirect('sequences');}
    private function save(?string $id):void{if($this->input->method(TRUE)==='POST'){try{$saved=$this->Storage_master_model->save_sequence($id,(string)$this->input->post('sequence_code',TRUE));redirect('sequences/view/'.$saved);return;}catch(Throwable $e){$this->session->set_flashdata('error',$e->getMessage());}}$row=$id?$this->Storage_master_model->sequence($id):array();$this->render('master/form',array('pageTitle'=>$id?'Edit sequence':'Create sequence','formAction'=>site_url($id?'sequences/edit/'.$id:'sequences/create'),'fields'=>array(array('name'=>'sequence_code','label'=>'Sequence code','value'=>$row['sequence_code']??'','required'=>true))));}
    private function require_any(array $p):void{foreach($p as $x)if($this->dts_authorization->allows($this->currentUser,$x))return;show_error('Forbidden',403);exit;}
}
