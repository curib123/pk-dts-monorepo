<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Softcopy_category_model extends MY_Model
{
    public function __construct(){parent::__construct();$this->load->database();$this->load->helper(array('dts_security','dts_admin'));}

    public function visible(int $page,int $limit,array $user): array
    {
        $all=$this->db->order_by('category_name')->get('softcopy_categories')->result_array();
        if(!$this->can_manage_all($user)){
            $uid=(string)$user['user_id'];$visibleIds=array();$byId=array();foreach($all as $c)$byId[(string)$c['softcopy_category_id']]=$c;
            $rows=$this->db->query('SELECT DISTINCT sc.softcopy_category_id FROM softcopy_categories sc LEFT JOIN softcopy_documents sd ON sd.softcopy_category_id=sc.softcopy_category_id LEFT JOIN document_assignments da ON da.document_id=sd.document_id WHERE sc.created_by_user_id=? OR da.user_id=?',array($uid,$uid))->result_array();
            foreach($rows as $row){$id=(string)$row['softcopy_category_id'];while($id!==''&&isset($byId[$id])&&!isset($visibleIds[$id])){$visibleIds[$id]=true;$id=(string)($byId[$id]['parent_category_id']??'');}}
            $all=array_values(array_filter($all,function($c)use($visibleIds){return isset($visibleIds[(string)$c['softcopy_category_id']]);}));
        }
        $total=count($all);$items=array_slice($all,($page-1)*$limit,$limit);return array('items'=>$items,'meta'=>array('total'=>$total,'page'=>$page,'limit'=>$limit,'total_pages'=>(int)ceil($total/max(1,$limit))));
    }

    public function find(string $id,array $user): ?array
    {
        $category=$this->db->where('softcopy_category_id',$id)->get('softcopy_categories')->row_array();if(!$category)return null;
        if(!$this->can_manage_all($user)&&(string)($category['created_by_user_id']??'')!==(string)$user['user_id']){
            $assigned=$this->db->query('SELECT 1 FROM softcopy_documents sd JOIN document_assignments da ON da.document_id=sd.document_id WHERE sd.softcopy_category_id=? AND da.user_id=? LIMIT 1',array($id,$user['user_id']))->row_array();if(!$assigned)return null;
        }
        $category['subcategories']=$this->db->where('parent_category_id',$id)->order_by('category_name')->get('softcopy_categories')->result_array();return $category;
    }

    public function create(array $data,array $user): string
    {
        $name=trim((string)($data['category_name']??''));if($name==='')throw new InvalidArgumentException('Folder name is required.');
        $parentId=!empty($data['parent_category_id'])?dts_id_string((string)$data['parent_category_id']):null;$parent=$parentId?$this->db->where('softcopy_category_id',$parentId)->get('softcopy_categories')->row_array():null;if($parentId&&!$parent)throw new RuntimeException('Main softcopy folder was not found.');
        $base=($parent?$parent['folder_name'].'/':'').$this->slugify($name);$folder=$this->unique_folder($base);
        $this->db->insert('softcopy_categories',array('category_name'=>$name,'folder_name'=>$folder,'description'=>$this->nullable($data['description']??null),'is_active'=>true,'parent_category_id'=>$parentId,'created_by_user_id'=>(string)$user['user_id'],'created_at'=>date('Y-m-d H:i:s'),'updated_at'=>date('Y-m-d H:i:s')));return (string)$this->db->insert_id();
    }

    public function update_category(string $id,array $data,array $user): void
    {
        $all=$this->db->get('softcopy_categories')->result_array();$byId=array();foreach($all as $c)$byId[(string)$c['softcopy_category_id']]=$c;if(!isset($byId[$id]))throw new RuntimeException('Softcopy folder was not found.');$current=$byId[$id];
        if(!$this->is_admin($user)&&(string)($current['created_by_user_id']??'')!==(string)$user['user_id'])throw new RuntimeException('Softcopy folder was not found.');
        $parentId=array_key_exists('parent_category_id',$data)?($data['parent_category_id']?dts_id_string((string)$data['parent_category_id']):null):(string)($current['parent_category_id']??'');if($parentId===$id)throw new InvalidArgumentException('A folder cannot be its own parent.');
        $subtree=array($id=>true);$changed=true;while($changed){$changed=false;foreach($all as $c){$pid=(string)($c['parent_category_id']??'');$cid=(string)$c['softcopy_category_id'];if($pid!==''&&isset($subtree[$pid])&&!isset($subtree[$cid])){$subtree[$cid]=true;$changed=true;}}}if($parentId&&isset($subtree[$parentId]))throw new InvalidArgumentException('A folder cannot be moved inside itself or one of its subfolders.');
        $name=array_key_exists('category_name',$data)?trim((string)$data['category_name']):$current['category_name'];$parent=$parentId&&isset($byId[$parentId])?$byId[$parentId]:null;if($parentId&&!$parent)throw new RuntimeException('Parent softcopy folder was not found.');$base=($parent?$parent['folder_name'].'/':'').$this->slugify($name);$rootPath=$this->unique_folder_for_subtree($base,$current['folder_name'],$subtree,$all);
        $this->db->trans_start();foreach($all as $c){$cid=(string)$c['softcopy_category_id'];if($cid!==$id&&isset($subtree[$cid])){$suffix=substr($c['folder_name'],strlen($current['folder_name']));$this->db->where('softcopy_category_id',$cid)->update('softcopy_categories',array('folder_name'=>$rootPath.$suffix,'updated_at'=>date('Y-m-d H:i:s')));}}
        $changes=array('category_name'=>$name,'folder_name'=>$rootPath,'updated_at'=>date('Y-m-d H:i:s'));if(array_key_exists('description',$data))$changes['description']=$this->nullable($data['description']);if(array_key_exists('parent_category_id',$data))$changes['parent_category_id']=$parentId;$this->db->where('softcopy_category_id',$id)->update('softcopy_categories',$changes);$this->db->trans_complete();if(!$this->db->trans_status())throw new RuntimeException('Unable to update softcopy folder.');
    }

    public function delete_category(string $id,array $user): void
    {
        $category=$this->db->where('softcopy_category_id',$id)->get('softcopy_categories')->row_array();if(!$category)throw new RuntimeException('Softcopy folder was not found.');if(!$this->can_manage_all($user)&&(string)($category['created_by_user_id']??'')!==(string)$user['user_id'])throw new RuntimeException('Softcopy folder was not found.');
        if($category['folder_name']==='uncategorized')throw new RuntimeException('The default Uncategorized category cannot be deleted.');
        if($this->db->where('softcopy_category_id',$id)->count_all_results('softcopy_documents')>0)throw new RuntimeException("Move the category's softcopy documents before deleting it.");
        if($this->db->where('parent_category_id',$id)->count_all_results('softcopy_categories')>0)throw new RuntimeException("Move or delete this folder's subfolders first.");
        $this->db->where('softcopy_category_id',$id)->delete('softcopy_categories');
    }

    public function all_options(): array{return $this->db->order_by('folder_name')->get('softcopy_categories')->result_array();}
    private function is_admin(array $user):bool{return dts_is_administrative_role($user['role']['role_name']??'');}
    private function can_manage_all(array $user):bool{return $this->is_admin($user)||in_array('softcopy-folders.manage',$user['role']['permissions']??array(),true);}
    private function slugify(string $v):string{$v=strtolower(trim($v));$v=preg_replace('/[^a-z0-9]+/','-',$v);$v=trim((string)$v,'-');return substr($v?:'category',0,120);}
    private function unique_folder(string $base):string{$candidate=$base;$n=2;while($this->db->where('folder_name',$candidate)->count_all_results('softcopy_categories')>0)$candidate=$base.'-'.$n++;return $candidate;}
    private function unique_folder_for_subtree(string $base,string $oldRoot,array $subtree,array $all):string{$outside=array();foreach($all as $c)if(!isset($subtree[(string)$c['softcopy_category_id']]))$outside[$c['folder_name']]=true;$candidate=$base;$n=2;while(true){$conflict=false;foreach($all as $c){$cid=(string)$c['softcopy_category_id'];if(!isset($subtree[$cid]))continue;$suffix=substr($c['folder_name'],strlen($oldRoot));if(isset($outside[$candidate.$suffix])){$conflict=true;break;}}if(!$conflict)return $candidate;$candidate=$base.'-'.$n++;}}
    private function nullable($v){$v=trim((string)$v);return $v===''?null:$v;}
}
